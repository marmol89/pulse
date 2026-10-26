import { EVENTS } from '../events.js';
import { applyLists, openCollection, resolveCollection } from '../actions.js';

const songs = (count) => (count === 1 ? '1 canción' : `${count} canciones`);

/**
 * Listas M3U (.m3u8): exportar cualquier colección (una lista, favoritos, un álbum…) para otros reproductores o
 * para guardarla, e importar un archivo como lista nueva con las canciones que estén en la biblioteca.
 */
export default {
  async [EVENTS.EXPORT_COLLECTION](ctx, source) {
    const { title, tracks } = resolveCollection(ctx, source);
    if (tracks.length === 0) return ctx.toast.show('No hay canciones que exportar');
    const result = await ctx.library.exportPlaylist(title, tracks);
    if (result.error) ctx.toast.show(result.error, { tone: 'error' });
    else if (result.saved) ctx.toast.show(`«${title}» exportada (${songs(tracks.length)})`);
  },

  async [EVENTS.IMPORT_LIST](ctx) {
    const found = await ctx.library.importPlaylist(ctx.catalog.all());
    if (!found) return;
    if (found.error) return ctx.toast.show(found.error, { tone: 'error' });
    if (found.paths.length === 0) return ctx.toast.show('Ninguna canción de esa lista está en tu biblioteca', { tone: 'error' });
    const result = await ctx.library.createList(ctx.lists.freeName(found.name.trim() || 'Lista importada'), found.paths);
    if (!result.ok) return ctx.toast.show(result.error, { tone: 'error' });
    applyLists(ctx, result.lists);
    openCollection(ctx, { kind: 'list', id: result.id });
    const missing = found.missing.length;
    ctx.toast.show(
      missing === 0 ? `Lista importada con ${songs(found.paths.length)}` : `Lista importada con ${songs(found.paths.length)}; ${missing === 1 ? 'falta 1' : `faltan ${missing}`} que no están en tu biblioteca`,
    );
  },
};
