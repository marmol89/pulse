import { EVENTS } from '../events.js';

/** Mini-reproductor (solo escritorio): la misma ventana, pequeña y siempre encima, con solo la player bar. */
export default {
  [EVENTS.APP_READY](ctx) {
    ctx.controls.setMiniAvailable(ctx.desktop.available());
  },

  [EVENTS.TOGGLE_MINI_PLAYER](ctx) {
    if (!ctx.desktop.available()) return;
    const mini = ctx.router.toggleMini();
    ctx.controls.setMini(mini);
    ctx.desktop.setMini(mini);
  },
};
