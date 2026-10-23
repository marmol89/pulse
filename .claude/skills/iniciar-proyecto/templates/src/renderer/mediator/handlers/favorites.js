import { EVENTS } from '../events.js';
import { eachTrackListView, refreshHome } from '../actions.js';

/** Corazón ♥: marcar/desmarcar favoritos y reflejarlo en todas las vistas. */
export default {
  [EVENTS.TOGGLE_FAVORITE](ctx, path) {
    const target = path ?? ctx.playlist.current()?.path;
    if (!target) return;
    const isFavorite = ctx.favorites.toggle(target);
    ctx.controls.setFavorite(target, isFavorite);
    ctx.nowPlaying.setFavorite(target, isFavorite);
    eachTrackListView(ctx, (view) => view.setFavorite(target, isFavorite));
    refreshHome(ctx);
  },
};
