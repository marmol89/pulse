import { EVENTS } from '../events.js';
import { fromCurrentSource, playCurrentOrClear, refreshLibraryViews, removeTracks, sourcePlace } from '../actions.js';

/**
 * Cambios en el bucket o en las carpetas (canciones nuevas, cambiadas o borradas). Los detecta el proceso main
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
    const message = changeMessage(fromCurrentSource(ctx, removed).length, added.length, sourcePlace(ctx));
    if (message) ctx.toast.show(message);
  },
};

function changeMessage(removed, added, place) {
  const parts = [];
  if (added > 0) parts.push(added === 1 ? '1 canción nueva' : `${added} canciones nuevas`);
  if (removed > 0) parts.push(removed === 1 ? `1 canción ya no está ${place}` : `${removed} canciones ya no están ${place}`);
  return parts.join(' · ');
}
