import { EVENTS } from '../events.js';
import { applyFavorites, showFavorite, refreshHome, renderCollection } from '../actions.js';

/**
 * Corazón ♥: marcar/desmarcar favoritos y reflejarlo en todas las vistas.
 * Los guarda el proceso main en el bucket; los de otros equipos llegan como favorites-changed.
 */
export default {
  /** Los favoritos de cuando solo eran de este equipo se suben una vez; sin conexión, se siguen viendo. */
  async [EVENTS.APP_READY](ctx) {
    const legacy = ctx.favorites.legacy();
    const result = legacy.length > 0 ? await ctx.library.importFavorites(legacy) : { ok: true, favorites: await ctx.library.favorites() };
    if (!result.ok) return;
    if (legacy.length > 0) ctx.favorites.forgetLegacy();
    applyFavorites(ctx, result.favorites);
  },

  /** Si "Tus favoritos" está abierta, se repinta: han podido entrar o salir canciones. */
  [EVENTS.FAVORITES_CHANGED](ctx, paths) {
    applyFavorites(ctx, paths);
    const source = ctx.playlistView.source();
    if (source?.kind === 'favorites') renderCollection(ctx, source);
  },

  /** Se ve al momento; si el proceso main no puede guardarlo, se deshace y se explica. */
  async [EVENTS.TOGGLE_FAVORITE](ctx, path) {
    const target = path ?? ctx.playlist.current()?.path;
    if (!target) return;
    const isFavorite = ctx.favorites.toggle(target);
    showFavorite(ctx, target, isFavorite);
    refreshHome(ctx);

    const result = await ctx.library.setFavorite(target, isFavorite);
    if (result.ok) return;
    if (ctx.favorites.has(target) === isFavorite) {
      showFavorite(ctx, target, ctx.favorites.toggle(target));
      refreshHome(ctx);
    }
    ctx.toast.show(result.error, { tone: 'error' });
  },
};
