import { EVENTS } from '../events.js';
import { SMART_KINDS, refreshHome, renderCollection } from '../actions.js';

/**
 * Escuchas: cuenta la pista que suena cuando se ha escuchado lo bastante (lo decide Plays) y la guarda en el
 * bucket; las de otros equipos llegan como plays-changed. Con ellas se hacen "Más escuchadas" y "Sin escuchar".
 */
export default {
  async [EVENTS.APP_READY](ctx) {
    ctx.plays.set(await ctx.library.plays());
    applyPlays(ctx);
  },

  [EVENTS.PLAYS_CHANGED](ctx, counts) {
    ctx.plays.set(counts);
    applyPlays(ctx);
  },

  [EVENTS.TRACK_STARTED](ctx) {
    const track = ctx.playlist.current();
    if (track) ctx.plays.started(track.path);
  },

  // Se ve al momento; si no se puede guardar en el bucket (sin conexión), se queda solo en esta sesión.
  async [EVENTS.TIME_UPDATE](ctx, { current, duration }) {
    const track = ctx.playlist.current();
    if (!track || !ctx.plays.progress(track.path, current, duration)) return;
    ctx.plays.increment(track.path);
    applyPlays(ctx);
    const result = await ctx.library.addPlay(track.path);
    if (result?.ok) ctx.plays.set(result.plays);
  },
};

/** Inicio y, si está abierta, la lista inteligente que se está viendo. */
function applyPlays(ctx) {
  refreshHome(ctx);
  const source = ctx.playlistView.source();
  if (SMART_KINDS.includes(source?.kind)) renderCollection(ctx, source);
}
