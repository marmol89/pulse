import { EVENTS } from '../events.js';

/** Corazón ♥: marcar/desmarcar favoritos y reflejarlo en todas las vistas. */
export default {
  [EVENTS.TOGGLE_FAVORITE](ctx, path) {
    const target = path ?? ctx.playlist.current()?.path;
    if (!target) return;
    const isFavorite = ctx.favorites.toggle(target);
    ctx.nowPlaying.setFavorite(target, isFavorite);
    ctx.controls.setFavorite(target, isFavorite);
    ctx.playlistView.setFavorite(target, isFavorite);
  },
};
