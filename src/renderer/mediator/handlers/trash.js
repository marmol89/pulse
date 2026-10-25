import { EVENTS } from '../events.js';
import { playCurrentOrClear, removeTracks } from '../actions.js';

/**
 * Papelera del bucket: "Eliminar del bucket" (con confirmación) mueve la canción a papelera/ y la quita de la
 * biblioteca; desde "Papelera" se restaura (vuelve como library-changed) o se vacía para siempre.
 */
export default {
  [EVENTS.TRASH_TRACK](ctx, path) {
    const track = ctx.catalog.get(path);
    if (track) ctx.trashDialog.openConfirm(track);
  },

  async [EVENTS.CONFIRM_TRASH](ctx, path) {
    const result = await ctx.library.trashTrack(path);
    if (!result?.ok) return ctx.trashDialog.showError(result?.error ?? 'No se pudo eliminar la canción');
    ctx.trashDialog.close();
    // Si sonaba, sigue la siguiente de la cola.
    const wasPlaying = ctx.audio.isPlaying();
    if (removeTracks(ctx, [path])) playCurrentOrClear(ctx, wasPlaying);
    ctx.toast.show('Movida a la papelera del bucket');
  },

  async [EVENTS.OPEN_TRASH](ctx) {
    ctx.trashDialog.openTrash(null);
    showResult(ctx, await ctx.library.getTrash());
  },

  async [EVENTS.RESTORE_FROM_TRASH](ctx, key) {
    if (showResult(ctx, await ctx.library.restoreFromTrash(key))) ctx.toast.show('Restaurada: vuelve a estar en tu biblioteca');
  },

  async [EVENTS.EMPTY_TRASH](ctx) {
    const result = await ctx.library.emptyTrash();
    if (!showResult(ctx, result)) return;
    ctx.toast.show(result.removed === 1 ? '1 canción borrada para siempre' : `${result.removed} canciones borradas para siempre`);
  },
};

/** Lo que hay en la papelera, o el error en el diálogo. */
function showResult(ctx, result) {
  if (!result?.ok) {
    ctx.trashDialog.showError(result?.error ?? 'No se pudo leer la papelera');
    return false;
  }
  ctx.trashDialog.showItems(result.items);
  return true;
}
