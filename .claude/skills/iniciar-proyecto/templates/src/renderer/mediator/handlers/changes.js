import { EVENTS } from '../events.js';
import { playCurrentOrClear, refreshLibraryViews, removeTracks } from '../actions.js';

/**
 * Cambios en el bucket (canciones subidas, cambiadas o borradas). Los detecta el proceso main
 * al arrancar, al volver a la ventana y con "Actualizar biblioteca".
 */
export default {
  [EVENTS.LIBRARY_CHANGED](ctx, { removed = [], added = [] }) {
    const wasPlaying = ctx.audio.isPlaying();
    if (added.length > 0) {
      ctx.catalog.add(added);
      refreshLibraryViews(ctx);
    }
    // Si sonaba una de las borradas, sigue la siguiente de la cola.
    if (removeTracks(ctx, removed)) playCurrentOrClear(ctx, wasPlaying);
    const message = changeMessage(removed.length, added.length);
    if (message) ctx.toast.show(message);
  },
};

function changeMessage(removed, added) {
  const parts = [];
  if (added > 0) parts.push(added === 1 ? '1 canción nueva' : `${added} canciones nuevas`);
  if (removed > 0) parts.push(removed === 1 ? '1 canción ya no está en el bucket' : `${removed} canciones ya no están en el bucket`);
  return parts.join(' · ');
}
