import { EVENTS } from '../events.js';
import { renderCollection } from '../actions.js';

/** Ordenar y filtrar "Tu biblioteca": el orden se recuerda; el filtro solo vale mientras se ve. */
export default {
  [EVENTS.SORT_LIBRARY](ctx, sort) {
    ctx.settings.setLibrarySort(sort);
    const source = ctx.playlistView.source();
    if (source?.kind === 'library') renderCollection(ctx, source);
  },

  [EVENTS.FILTER_LIBRARY](ctx, filter) {
    const source = ctx.playlistView.source();
    if (source?.kind === 'library') renderCollection(ctx, { kind: 'library', filter: String(filter ?? '') });
  },
};
