// Utilitário compartilhado para consultar a base gerada em aeroportos-data.js.
const AeroportosDB = {
    todos() {
        return (typeof AEROPORTOS_IATA !== 'undefined') ? AEROPORTOS_IATA : [];
    },

    normalizar(valor) {
        return (valor || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase();
    },

    // Busca por código IATA, cidade, nome do aeroporto ou país.
    buscar(query) {
        const termo = this.normalizar(query);
        if (!termo) return [];

        return this.todos()
            .filter(aeroporto => [
                aeroporto.codigo,
                aeroporto.nome,
                aeroporto.aeroporto,
                aeroporto.pais
            ].some(valor => this.normalizar(valor).includes(termo)))
            .slice(0, 15)
            .map(aeroporto => ({
                codigo: aeroporto.codigo,
                cidade: aeroporto.nome,
                aeroporto: aeroporto.aeroporto,
                pais: aeroporto.pais
            }));
    },

    getByCodigo(codigo) {
        const codigoNormalizado = this.normalizar(codigo);
        return this.todos().find(aeroporto => aeroporto.codigo === codigoNormalizado) || null;
    }
};

if (typeof window !== 'undefined') {
    window.AeroportosDB = AeroportosDB;
}
