import { EVENTS } from '../events.js';
import { refreshHome } from '../actions.js';

/** "Escuchado recientemente": registra cada pista que empieza a sonar. */
export default {
  [EVENTS.TRACK_STARTED](ctx) {
    const track = ctx.playlist.current();
    if (!track) return;
    ctx.recents.add(track);
    refreshHome(ctx);
  },
};
