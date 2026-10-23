import { EVENTS } from '../events.js';
import { loadTrack } from '../actions.js';

/** Errores de reproducción: avisar y saltar a la siguiente pista. */
export default {
  [EVENTS.ERROR](ctx, error) {
    ctx.nowPlaying.showError(error?.message ?? 'No se pudo reproducir la pista');
    loadTrack(ctx, ctx.playlist.next());
  },
};
