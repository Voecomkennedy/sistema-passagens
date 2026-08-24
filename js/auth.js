// ============================================
// Autenticação (login / logout / proteção de página)
// ============================================

const Auth = {
    // Retorna a sessão atual (ou null se não logado)
    async getSession() {
        const client = getSupabaseClient();
        if (!client) return null;
        const { data } = await client.auth.getSession();
        return data ? data.session : null;
    },

    // Retorna o usuário logado (ou null)
    async getUser() {
        const client = getSupabaseClient();
        if (!client) return null;

        // getUser consulta o servidor de autenticação e valida o token.
        // Não usar apenas os dados locais da sessão para autorizar uma página.
        const { data, error } = await client.auth.getUser();
        if (error) {
            console.warn('Não foi possível validar o usuário:', error.message);
            return null;
        }
        return data ? data.user : null;
    },

    // Faz login com e-mail e senha
    async login(email, senha) {
        const client = getSupabaseClient();
        if (!client) return { ok: false, erro: 'Sistema de nuvem indisponível.' };

        const { data, error } = await client.auth.signInWithPassword({
            email: email.trim(),
            password: senha
        });

        if (error) {
            let msg = 'E-mail ou senha incorretos.';
            if (error.message && error.message.includes('Email not confirmed')) {
                msg = 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
            }
            return { ok: false, erro: msg };
        }
        return { ok: true, user: data.user };
    },

    // Faz logout
    async logout() {
        const client = getSupabaseClient();
        if (client) await client.auth.signOut();
        // Limpa o cache local de dados do app (cada conta baixa os seus ao logar)
        try {
            [
                'emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes',
                'emissao_cloud_sync_meta_v2', 'emissao_cloud_sync_ultimo_conflito',
                'emissao_cloud_sync_usuario_local'
            ].forEach(chave => localStorage.removeItem(chave));
        } catch (e) { /* ignora */ }
        window.location.href = 'login.html';
    },

    // Protege uma página: se não estiver logado, manda pro login.
    // Use no topo de cada página interna.
    async proteger() {
        const user = await this.getUser();
        if (!user) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    // Retorna o ID único do usuário logado (usado para separar dados por agência)
    async getUserId() {
        const user = await this.getUser();
        return user ? user.id : null;
    }
};

window.Auth = Auth;
