import { EVENTS } from '../events.js';
import { refreshLibraryViews } from '../actions.js';

/** Biblioteca: la guardada al arrancar y "Actualizar biblioteca" con el bucket. */
export default {
  async [EVENTS.APP_READY](ctx) {
    ctx.catalog.add(await ctx.library.load());
    refreshLibraryViews(ctx);
  },

  // Los cambios llegan como library-changed (handlers/changes.js), con su propio aviso.
  async [EVENTS.SYNC_LIBRARY](ctx) {
    ctx.toast.show('Actualizando tu biblioteca…', { sticky: true });
    try {
      const { added, removed } = await ctx.library.sync();
      if (added + removed === 0) ctx.toast.show('Tu biblioteca ya está al día');
    } catch {
      ctx.toast.show('No se pudo conectar con el almacenamiento', { tone: 'error' });
    }
  },
};
