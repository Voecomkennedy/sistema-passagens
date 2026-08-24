// Sincronização com controle otimista de versão.
// O LocalStorage continua sendo o cache rápido, mas uma versão desatualizada
// nunca sobrescreve silenciosamente os dados gravados por outro aparelho.
const CloudSync = {
    _salvandoTimeout: null,
    _userId: null,
    _online: false,
    _monitorando: false,
    _backupPendente: false,
    _aplicandoNuvem: false,
    _versaoNuvem: null,
    _envioEmAndamento: null,
    _reenviarDepois: false,
    _inicializado: false,

    CHAVES: ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'],
    META_KEY: 'emissao_cloud_sync_meta_v2',
    CONFLITO_KEY: 'emissao_cloud_sync_ultimo_conflito',
    USUARIO_LOCAL_KEY: 'emissao_cloud_sync_usuario_local',

    async init() {
        if (this._inicializado) return true;

        const client = getSupabaseClient();
        if (!client) return false;

        this._userId = await Auth.getUserId();
        if (!this._userId) return false;

        this._prepararCacheDoUsuario();
        this._online = true;
        const sincronizado = await this.baixarDaNuvem();
        this._monitorarLocalStorage();
        this._registrarSalvamentoDeEmergencia();
        this._inicializado = true;

        if (sincronizado !== false) this._atualizarIndicador('sincronizado');
        return sincronizado !== false;
    },

    _prepararCacheDoUsuario() {
        const usuarioAnterior = localStorage.getItem(this.USUARIO_LOCAL_KEY);
        if (usuarioAnterior && usuarioAnterior !== this._userId) {
            // O LocalStorage é compartilhado por todas as contas deste domínio.
            // Nunca mostrar nem enviar o cache pertencente a outro usuário.
            this.CHAVES.forEach(chave => localStorage.removeItem(chave));
            localStorage.removeItem(this.META_KEY);
            localStorage.removeItem(this.CONFLITO_KEY);
        }
        localStorage.setItem(this.USUARIO_LOCAL_KEY, this._userId);
    },

    _obterConteudoLocal() {
        const conteudo = {};
        this.CHAVES.forEach(chave => {
            const raw = localStorage.getItem(chave);
            const valor = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(valor)) throw new Error(`Dados locais inválidos em ${chave}`);
            conteudo[chave] = valor;
        });
        return conteudo;
    },

    _temRegistros(conteudo) {
        return this.CHAVES.some(chave => Array.isArray(conteudo[chave]) && conteudo[chave].length > 0);
    },

    _fingerprint(conteudo) {
        const texto = JSON.stringify(Object.fromEntries(
            this.CHAVES.map(chave => [chave, conteudo[chave] || []])
        ));
        let hash = 2166136261;
        for (let i = 0; i < texto.length; i++) {
            hash ^= texto.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `${texto.length}:${(hash >>> 0).toString(16)}`;
    },

    _obterMeta() {
        try {
            const meta = JSON.parse(localStorage.getItem(this.META_KEY) || 'null');
            return meta && meta.userId === this._userId ? meta : null;
        } catch {
            return null;
        }
    },

    _salvarMeta(versao, conteudo, atualizadoEm = null) {
        localStorage.setItem(this.META_KEY, JSON.stringify({
            userId: this._userId,
            versao: Number(versao) || 0,
            fingerprint: this._fingerprint(conteudo),
            atualizadoEm: atualizadoEm || new Date().toISOString()
        }));
    },

    _aplicarConteudo(conteudo) {
        this._aplicandoNuvem = true;
        try {
            this.CHAVES.forEach(chave => {
                const valor = conteudo[chave] === undefined ? [] : conteudo[chave];
                if (!Array.isArray(valor)) {
                    throw new Error(`Dados da nuvem inválidos em ${chave}`);
                }
                localStorage.setItem(chave, JSON.stringify(valor));
            });
        } finally {
            this._aplicandoNuvem = false;
        }
    },

    _registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, resolucao = 'pendente') {
        localStorage.setItem(this.CONFLITO_KEY, JSON.stringify({
            detectadoEm: new Date().toISOString(),
            userId: this._userId,
            versaoNuvem,
            atualizadoEm,
            resolucao,
            local,
            nuvem
        }));
    },

    async _resolverConflito(local, nuvem, versaoNuvem, atualizadoEm) {
        this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm);
        this._atualizarIndicador('conflito', 'Há alterações diferentes neste aparelho e na nuvem.');

        const usarNuvem = window.confirm(
            'CONFLITO DE SINCRONIZAÇÃO\n\n' +
            'Outro aparelho alterou os dados enquanto este aparelho também tinha mudanças.\n\n' +
            'OK: usar a versão da NUVEM (uma cópia local ficará guardada).\n' +
            'CANCELAR: manter os dados DESTE APARELHO e substituir a nuvem.\n\n' +
            'Nenhuma opção apaga a cópia de segurança do conflito.'
        );

        this._versaoNuvem = Number(versaoNuvem) || 0;
        if (usarNuvem) {
            this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, 'nuvem');
            this._aplicarConteudo(nuvem);
            this._salvarMeta(this._versaoNuvem, nuvem, atualizadoEm);
            this._backupPendente = false;
            this._atualizarIndicador('sincronizado');
            return true;
        }

        this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, 'local');
        return this._enviarConteudo(local, true);
    },

    async baixarDaNuvem() {
        const client = getSupabaseClient();
        if (!client || !this._userId) return false;

        try {
            const { data, error } = await client
                .from('dados_app')
                .select('conteudo, atualizado_em, versao')
                .eq('user_id', this._userId)
                .maybeSingle();

            if (error) throw error;

            const local = this._obterConteudoLocal();
            if (!data) {
                this._versaoNuvem = null;
                return this._enviarConteudo(local);
            }

            const nuvem = data.conteudo || {};
            const versaoNuvem = Number(data.versao) || 0;
            const meta = this._obterMeta();
            const hashLocal = this._fingerprint(local);
            const hashNuvem = this._fingerprint(nuvem);
            this._versaoNuvem = versaoNuvem;

            if (hashLocal === hashNuvem) {
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (!this._temRegistros(local)) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            const localNaoMudou = meta && hashLocal === meta.fingerprint;
            const nuvemNaoMudou = meta &&
                versaoNuvem === Number(meta.versao) &&
                hashNuvem === meta.fingerprint;

            if (localNaoMudou) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (nuvemNaoMudou) {
                return this._enviarConteudo(local);
            }

            return this._resolverConflito(local, nuvem, versaoNuvem, data.atualizado_em);
        } catch (error) {
            console.error('Erro ao baixar da nuvem:', error);
            this._atualizarIndicador('erro', error.message);
            return false;
        }
    },

    async _buscarVersaoAtual() {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('dados_app')
            .select('conteudo, atualizado_em, versao')
            .eq('user_id', this._userId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async _enviarConteudo(conteudo, confirmouSobrescrita = false) {
        const client = getSupabaseClient();
        if (!client || !this._userId) return false;

        const proximaVersao = (Number(this._versaoNuvem) || 0) + 1;
        const registro = {
            user_id: this._userId,
            conteudo,
            versao: proximaVersao,
            atualizado_em: new Date().toISOString()
        };

        let resposta;
        if (this._versaoNuvem === null) {
            resposta = await client
                .from('dados_app')
                .insert(registro)
                .select('versao, atualizado_em')
                .maybeSingle();
        } else {
            resposta = await client
                .from('dados_app')
                .update(registro)
                .eq('user_id', this._userId)
                .eq('versao', this._versaoNuvem)
                .select('versao, atualizado_em')
                .maybeSingle();
        }

        if (resposta.error) {
            if (resposta.error.code !== '23505') throw resposta.error;
        } else if (resposta.data) {
            this._versaoNuvem = Number(resposta.data.versao) || proximaVersao;
            this._salvarMeta(this._versaoNuvem, conteudo, resposta.data.atualizado_em);
            this._backupPendente = false;
            this._atualizarIndicador('sincronizado');
            return true;
        }

        const atual = await this._buscarVersaoAtual();
        if (!atual) throw new Error('A nuvem não retornou o registro esperado.');

        if (confirmouSobrescrita) {
            // Outro conflito aconteceu enquanto a escolha anterior era aplicada.
            // Volta ao fluxo assistido em vez de insistir automaticamente.
            confirmadoSobrescrita = false;
        }
        return this._resolverConflito(
            conteudo,
            atual.conteudo || {},
            Number(atual.versao) || 0,
            atual.atualizado_em
        );
    },

    async enviarParaNuvem() {
        if (!this._online || !this._userId) return false;

        if (this._envioEmAndamento) {
            this._reenviarDepois = true;
            return this._envioEmAndamento;
        }

        this._envioEmAndamento = (async () => {
            try {
                return await this._enviarConteudo(this._obterConteudoLocal());
            } catch (error) {
                console.error('Erro ao enviar para a nuvem:', error);
                this._atualizarIndicador('erro', error.message);
                return false;
            } finally {
                this._envioEmAndamento = null;
                if (this._reenviarDepois) {
                    this._reenviarDepois = false;
                    this.agendarBackup(0);
                }
            }
        })();

        return this._envioEmAndamento;
    },

    agendarBackup(atraso = 1500) {
        if (!this._online || this._aplicandoNuvem) return;
        this._backupPendente = true;
        this._atualizarIndicador('salvando');
        clearTimeout(this._salvandoTimeout);
        this._salvandoTimeout = setTimeout(() => this.enviarParaNuvem(), atraso);
    },

    _monitorarLocalStorage() {
        if (this._monitorando) return;
        const originalSetItem = localStorage.setItem.bind(localStorage);
        const self = this;

        localStorage.setItem = function (chave, valor) {
            originalSetItem(chave, valor);
            if (!self._aplicandoNuvem && self.CHAVES.includes(chave)) {
                self.agendarBackup();
            }
        };
        this._monitorando = true;
        try { localStorage.removeItem('_cloudSyncAtivo'); } catch (_) {}
    },

    _registrarSalvamentoDeEmergencia() {
        if (this._eventosEmergenciaRegistrados) return;
        this._eventosEmergenciaRegistrados = true;

        const tentarSalvar = () => {
            if (!this._backupPendente) return;
            clearTimeout(this._salvandoTimeout);
            this.enviarParaNuvem();
        };
        window.addEventListener('beforeunload', tentarSalvar);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') tentarSalvar();
        });
    },

    _atualizarIndicador(estado, detalhe = '') {
        const el = document.getElementById('cloudStatus');
        if (!el) return;

        const mapa = {
            salvando: { icon: 'bi-cloud-arrow-up', texto: 'Salvando...', cor: '#F59E0B' },
            sincronizado: { icon: 'bi-cloud-check', texto: 'Salvo na nuvem', cor: '#10B981' },
            conflito: { icon: 'bi-exclamation-triangle', texto: 'Conflito de sincronização', cor: '#DC2626' },
            erro: { icon: 'bi-cloud-slash', texto: 'Erro ao salvar na nuvem', cor: '#EF4444' }
        };
        const info = mapa[estado] || mapa.sincronizado;

        el.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `bi ${info.icon}`;
        el.append(icon, document.createTextNode(` ${info.texto}`));
        el.style.color = info.cor;
        el.title = detalhe ? `Detalhe: ${detalhe}` : '';
    }
};

window.CloudSync = CloudSync;
