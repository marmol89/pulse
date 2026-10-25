import { EVENTS } from '../events.js';
import { renderCollection, resolveCollection } from '../actions.js';

/** Descargas para escuchar sin conexión (solo Android): listas, favoritos y álbumes, y "Borrar descargas". */
export default {
  async [EVENTS.APP_READY](ctx) {
    if (!ctx.library.canDownload()) return;
    show(ctx, await ctx.library.getDownloads());
  },

  async [EVENTS.DOWNLOAD_COLLECTION](ctx, source) {
    show(ctx, await ctx.library.downloadTracks(pathsOf(ctx, source)));
    const pending = ctx.downloads.pendingCount();
    if (pending > 0) ctx.toast.show(pending === 1 ? 'Descargando 1 canción…' : `Descargando ${pending} canciones…`);
  },

  async [EVENTS.REMOVE_DOWNLOADS](ctx, source) {
    show(ctx, await ctx.library.removeDownloads(pathsOf(ctx, source)));
    ctx.toast.show('Descarga quitada del móvil');
  },

  async [EVENTS.CLEAR_DOWNLOADS](ctx) {
    show(ctx, await ctx.library.clearDownloads());
    ctx.toast.show('Descargas borradas');
  },

  [EVENTS.DOWNLOADS_CHANGED](ctx, summary) {
    const wasPending = ctx.downloads.pendingCount();
    show(ctx, summary);
    if (wasPending === 0 || ctx.downloads.pendingCount() > 0) return;
    const failed = ctx.downloads.failedCount();
    if (failed > 0) ctx.toast.show(failed === 1 ? 'No se pudo descargar 1 canción' : `No se pudieron descargar ${failed} canciones`, { tone: 'error' });
    else ctx.toast.show('Descargas terminadas: se pueden escuchar sin conexión');
  },
};

function pathsOf(ctx, source) {
  return resolveCollection(ctx, source).tracks.map((track) => track.path);
}

/** El estado nuevo en el modelo, en "Tu música" y en la colección abierta. */
function show(ctx, summary) {
  ctx.downloads.set(summary);
  ctx.router.setDownloads(ctx.downloads.summary());
  const source = ctx.playlistView.source();
  if (source) renderCollection(ctx, source);
}
