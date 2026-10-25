import { EVENTS } from '../events.js';
import { refreshHome, renderCollection } from '../actions.js';

/**
 * "Escuchado recientemente": registra cada pista que empieza a sonar. Las guarda el proceso main en el
 * bucket; las de otros equipos llegan como recents-changed.
 */
export default {
  /** Los recientes de cuando solo eran de este equipo se suben una vez; sin conexión, se siguen viendo. */
  async [EVENTS.APP_READY](ctx) {
    const legacy = ctx.recents.legacy();
    const result = legacy.length > 0 ? await ctx.library.importRecents(legacy) : { ok: true, recents: await ctx.library.recents() };
    if (!result.ok) return;
    if (legacy.length > 0) ctx.recents.forgetLegacy();
    applyRecents(ctx, result.recents);
  },

  [EVENTS.RECENTS_CHANGED](ctx, paths) {
    applyRecents(ctx, paths);
  },

  // Se ve al momento; si no se puede guardar en el bucket (sin conexión), se queda solo en esta sesión.
  async [EVENTS.TRACK_STARTED](ctx) {
    const track = ctx.playlist.current();
    if (!track) return;
    ctx.recents.add(track.path);
    refreshHome(ctx);
    const result = await ctx.library.addRecent(track.path);
    if (result?.ok) ctx.recents.set(result.recents);
  },
};

/** Inicio y, si está abierta, "Escuchado recientemente" con la copia recibida. */
function applyRecents(ctx, paths) {
  ctx.recents.set(paths);
  refreshHome(ctx);
  const source = ctx.playlistView.source();
  if (source?.kind === 'recents') renderCollection(ctx, source);
}
