import { EVENTS } from '../events.js';
import { playCurrentOrClear, refreshLibraryViews, removeTracks } from '../actions.js';

/**
 * Archivos que desaparecen del disco o vuelven (p. ej. al reconectar un disco) con la app
 * abierta. Lo detecta el proceso main al volver a la ventana.
 */
export default {
  [EVENTS.LIBRARY_CHANGED](ctx, { removed = [], restored = [] }) {
    const wasPlaying = ctx.audio.isPlaying();
    if (restored.length > 0) {
      ctx.catalog.add(restored);
      refreshLibraryViews(ctx);
    }
    // Si sonaba una de las que faltan, sigue la siguiente de la cola.
    if (removeTracks(ctx, removed)) playCurrentOrClear(ctx, wasPlaying);
    const message = changeMessage(removed.length, restored.length);
    if (message) ctx.toast.show(message);
  },
};

function changeMessage(removed, restored) {
  const parts = [];
  if (removed > 0) parts.push(removed === 1 ? '1 canción ya no está en el disco' : `${removed} canciones ya no están en el disco`);
  if (restored > 0) parts.push(restored === 1 ? '1 canción vuelve a estar disponible' : `${restored} canciones vuelven a estar disponibles`);
  return parts.join(' · ');
}
