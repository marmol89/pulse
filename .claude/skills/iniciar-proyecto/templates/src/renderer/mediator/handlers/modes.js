import { EVENTS } from '../events.js';
import { loadTrack } from '../actions.js';

/** Modos de reproducción. Los algoritmos de shuffle/repeat viven en Playlist. */
export default {
  [EVENTS.TOGGLE_SHUFFLE](ctx) {
    ctx.controls.setShuffle(ctx.playlist.toggleShuffle());
  },

  [EVENTS.CYCLE_REPEAT](ctx) {
    ctx.controls.setRepeat(ctx.playlist.cycleRepeat());
  },

  // Tarjeta "Mix diario" del diseño: toda la biblioteca en aleatorio.
  [EVENTS.PLAY_MIX](ctx) {
    ctx.controls.setShuffle(ctx.playlist.shuffleAll());
    loadTrack(ctx, ctx.playlist.current());
  },
};
