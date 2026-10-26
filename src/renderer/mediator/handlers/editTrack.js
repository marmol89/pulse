import { EVENTS } from '../events.js';
import { applyTrackUpdates } from '../actions.js';

/** Guarda (o, con `changes` null, quita) lo editado y lo pinta en todas partes, como un dato de internet. */
async function save(ctx, path, changes, message) {
  const result = await ctx.library.editTrack(path, changes);
  if (!result.ok) return ctx.trackEditDialog.showError(result.error);
  ctx.trackEditDialog.close();
  applyTrackUpdates(ctx, [result.track]);
  ctx.toast.show(message);
}

/**
 * "Editar datos" de una canción (en el «⋯» de cada fila): lo cambiado gana a las etiquetas del archivo y a los datos
 * de internet; el main lo guarda en la biblioteca y llega a los demás Pulse con metadatos/biblioteca.json.
 */
export default {
  [EVENTS.EDIT_TRACK](ctx, path) {
    const track = ctx.catalog.get(path);
    if (track) ctx.trackEditDialog.open(track);
  },

  [EVENTS.SAVE_TRACK_EDITS](ctx, { path, changes }) {
    return save(ctx, path, changes, 'Datos guardados');
  },

  [EVENTS.RESTORE_TRACK_DATA](ctx, path) {
    return save(ctx, path, null, 'Datos del archivo restaurados');
  },
};
