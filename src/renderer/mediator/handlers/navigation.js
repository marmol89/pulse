import { EVENTS } from '../events.js';
import { loadTrack, playCollection } from '../actions.js';

const RESTART_THRESHOLD_SECONDS = 3;

/** Navegación entre pistas. Las reglas de aleatorio/repetir viven en Playlist, no aquí. */
export default {
  [EVENTS.NEXT](ctx) {
    loadTrack(ctx, ctx.playlist.next());
  },

  [EVENTS.PREVIOUS](ctx) {
    // Comportamiento clásico: si la pista ya avanzó, se reinicia en vez de retroceder.
    if (ctx.audio.currentTime() > RESTART_THRESHOLD_SECONDS) {
      ctx.audio.seek(0);
      return;
    }
    if (!loadTrack(ctx, ctx.playlist.previous())) ctx.audio.seek(0);
  },

  [EVENTS.TRACK_SELECTED](ctx, { source, path }) {
    playCollection(ctx, source, path);
  },

  [EVENTS.PLAY_COLLECTION](ctx, source) {
    playCollection(ctx, source);
  },

  [EVENTS.ENDED](ctx) {
    loadTrack(ctx, ctx.playlist.nextOnEnded());
  },
};
