import { EVENTS } from '../events.js';
import { openCollection, trackListState } from '../actions.js';

/** Navegación entre vistas: sidebar, colecciones, overlay Reproduciendo y búsqueda. */
export default {
  [EVENTS.NAVIGATE](ctx, view) {
    if (view === 'library') {
      openCollection(ctx, { kind: 'library' });
      return;
    }
    ctx.router.closeOverlay();
    ctx.router.show(view);
    if (view === 'search') ctx.search.focus();
  },

  [EVENTS.NAVIGATE_BACK](ctx) {
    ctx.router.back();
  },

  [EVENTS.OPEN_COLLECTION](ctx, source) {
    openCollection(ctx, source);
  },

  [EVENTS.OPEN_NOW_PLAYING](ctx) {
    if (ctx.playlist.current()) ctx.router.openOverlay();
  },

  [EVENTS.CLOSE_NOW_PLAYING](ctx) {
    ctx.router.closeOverlay();
  },

  [EVENTS.SEARCH](ctx, query) {
    ctx.search.showResults(query, ctx.catalog.search(query), trackListState(ctx));
  },
};
