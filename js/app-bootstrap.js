// Inicialização única das páginas internas.
// Confirma o usuário e sincroniza os dados antes de liberar qualquer renderização.
const AppBootstrap = {
    _iniciando: null,

    async iniciar(callback = null) {
        if (this._iniciando) return this._iniciando;

        this._iniciando = (async () => {
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
            }

            const autenticado = await Auth.proteger();
            if (!autenticado) return false;

            await CloudSync.init();
            document.documentElement.dataset.appAutenticado = 'true';
            document.dispatchEvent(new CustomEvent('app:ready'));

            if (typeof callback === 'function') await callback();
            return true;
        })().catch(error => {
            console.error('Falha ao inicializar página protegida:', error);
            return false;
        });

        return this._iniciando;
    }
};

window.AppBootstrap = AppBootstrap;
