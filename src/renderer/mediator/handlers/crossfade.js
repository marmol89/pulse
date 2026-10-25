import { EVENTS } from '../events.js';

const LABELS = { 0: 'Sin fundido entre canciones' };

/** Sin cortes entre pistas (la siguiente se precarga) y fundido opcional entre canciones. */
export default {
  [EVENTS.APP_READY](ctx) {
    ctx.router.setCrossfade(ctx.audio.crossfade());
  },

  // Se pregunta a la cola al final: así cuentan los cambios de orden, aleatorio o repetir de última hora.
  [EVENTS.NEAR_END](ctx) {
    ctx.audio.prepareNext(ctx.playlist.upcoming()?.url);
  },

  [EVENTS.SET_CROSSFADE](ctx, seconds) {
    const applied = ctx.audio.setCrossfade(seconds);
    ctx.router.setCrossfade(applied);
    ctx.toast.show(LABELS[applied] ?? `Fundido de ${applied} s entre canciones`);
  },
};
