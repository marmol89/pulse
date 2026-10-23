import { EVENTS } from '../events.js';
import { refreshHome } from '../actions.js';

/** Navegación entre vistas (sidebar, vista Reproduciendo, filtros y búsqueda). */
export default {
  [EVENTS.NAVIGATE](ctx, view) {
    ctx.router.show(view);
    if (view === 'home') refreshHome(ctx);
  },

  [EVENTS.OPEN_NOW_PLAYING](ctx) {
    ctx.router.openOverlay('now-playing');
  },

  [EVENTS.CLOSE_NOW_PLAYING](ctx) {
    ctx.router.closeOverlay();
  },

  [EVENTS.FILTER_CHANGE](ctx, filter) {
    const tracks = filter === 'favorites'
      ? ctx.playlist.tracks().filter((t) => ctx.favorites.has(t.path))
      : ctx.playlist.tracks();
    ctx.home.setFilter(filter, tracks);
  },

  [EVENTS.SEARCH](ctx, query) {
    ctx.search.showResults(ctx.playlist.search(query));
  },
};
