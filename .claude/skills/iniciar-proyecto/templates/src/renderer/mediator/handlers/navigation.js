import { EVENTS } from '../events.js';
import { loadTrack } from '../actions.js';

const RESTART_THRESHOLD_SECONDS = 3;

/** Navegación entre pistas. Las reglas de shuffle/repeat viven en Playlist, no aquí. */
export default {
  [EVENTS.NEXT](ctx) {
    loadTrack(ctx, ctx.playlist.next());
  },

  [EVENTS.PREVIOUS](ctx) {
    // Comportamiento clásico: si la pista ya avanzó, reiníciala en vez de retroceder.
    if (ctx.audio.currentTime() > RESTART_THRESHOLD_SECONDS) ctx.audio.seek(0);
    else loadTrack(ctx, ctx.playlist.previous());
  },

  [EVENTS.TRACK_SELECTED](ctx, index) {
    loadTrack(ctx, ctx.playlist.setIndex(index));
  },

  [EVENTS.ENDED](ctx) {
    if (!loadTrack(ctx, ctx.playlist.nextOnEnded())) ctx.controls.setPlaying(false);
  },
};
