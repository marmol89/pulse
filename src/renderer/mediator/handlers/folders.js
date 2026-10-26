import { EVENTS } from '../events.js';
import { finishConnection } from '../actions.js';

/**
 * Carpetas del equipo en vez del bucket (pestaña "Carpetas" de Conexión): añadirlas con el selector del sistema
 * y, al pulsar "Usar estas carpetas", comprobarlas y traer su música. Pulse nunca modifica esos archivos.
 */
export default {
  async [EVENTS.CHOOSE_FOLDER](ctx) {
    try {
      const folder = await ctx.library.chooseFolder();
      if (folder) ctx.connection.addFolder(folder);
    } catch {
      ctx.connection.showError('No se pudo abrir esa carpeta');
    }
  },

  async [EVENTS.SAVE_FOLDERS](ctx, ids) {
    ctx.connection.setBusy(true);
    try {
      const result = await ctx.library.saveFolders(ids);
      await finishConnection(ctx, result, result.ok ? found(result.count) : '');
    } finally {
      ctx.connection.setBusy(false);
    }
  },
};

function found(count) {
  if (count === 0) return 'Usando tus carpetas: aún no hay canciones en ellas';
  return count === 1 ? 'Usando tus carpetas: 1 canción' : `Usando tus carpetas: ${count} canciones`;
}
