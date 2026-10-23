import { EVENTS } from '../events.js';
import { playCollection, showModes } from '../actions.js';

/** Modos de reproducción. Los algoritmos de aleatorio/repetir viven en Playlist. */
export default {
  [EVENTS.APP_READY](ctx) {
    showModes(ctx);
  },

  [EVENTS.TOGGLE_SHUFFLE](ctx) {
    ctx.playlist.toggleShuffle();
    showModes(ctx);
  },

  [EVENTS.CYCLE_REPEAT](ctx) {
    ctx.playlist.cycleRepeat();
    showModes(ctx);
  },

  // Tarjeta "Mix diario" del diseño: toda la biblioteca en aleatorio.
  [EVENTS.PLAY_MIX](ctx) {
    ctx.playlist.setShuffle(true);
    showModes(ctx);
    playCollection(ctx, { kind: 'mix' });
  },
};
