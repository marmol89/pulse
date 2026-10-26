import { EVENTS } from '../events.js';

const isReady = (status) => status?.state === 'ready';

/**
 * Actualizaciones de Pulse (solo la app instalada en el ordenador): el main descarga la versión nueva en segundo plano
 * y se instala al cerrar; mientras, "Tu música" lo avisa con "Reiniciar ahora".
 */
export default {
  async [EVENTS.APP_READY](ctx) {
    const status = await ctx.desktop.updateStatus();
    ctx.router.setUpdate(isReady(status) ? status.version : null);
  },

  [EVENTS.UPDATE_STATUS](ctx, status) {
    ctx.router.setUpdate(isReady(status) ? status.version : null);
    if (isReady(status)) ctx.toast.show(`Pulse ${status.version} está lista: se instalará al cerrar`);
  },

  [EVENTS.INSTALL_UPDATE](ctx) {
    ctx.desktop.installUpdate();
  },
};
