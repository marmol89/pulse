import { EVENTS } from '../events.js';
import { loadTrack } from '../actions.js';

/** Errores de reproducción: avisar y saltar a la siguiente pista. */
export default {
  [EVENTS.ERROR](ctx, error) {
    ctx.toast.show(error?.message ?? 'No se pudo reproducir la pista', { tone: 'error' });
    // Si ya fallaron tantas pistas seguidas como hay en la cola, parar en vez de girar en bucle.
    if (ctx.audio.consecutiveErrors() >= ctx.playlist.size()) return;
    loadTrack(ctx, ctx.playlist.next());
  },
};
