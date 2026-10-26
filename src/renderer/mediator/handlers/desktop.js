import { EVENTS } from '../events.js';

/** Bandeja del sistema y barra de tareas (solo escritorio): lo que suena y "Al cerrar, seguir en la bandeja". */
export default {
  [EVENTS.APP_READY](ctx) {
    const enabled = ctx.settings.closeToTray();
    ctx.desktop.setCloseToTray(enabled);
    ctx.router.setCloseToTray(enabled, ctx.desktop.available());
    showNow(ctx);
  },

  [EVENTS.STATE_CHANGE](ctx) {
    showNow(ctx);
  },

  [EVENTS.TRACK_STARTED](ctx) {
    showNow(ctx);
  },

  [EVENTS.SET_CLOSE_TO_TRAY](ctx, enabled) {
    const applied = ctx.settings.setCloseToTray(enabled);
    ctx.desktop.setCloseToTray(applied);
    ctx.router.setCloseToTray(applied, ctx.desktop.available());
    ctx.toast.show(applied ? 'Al cerrar la ventana, Pulse seguirá sonando en la bandeja' : 'Al cerrar la ventana, Pulse se cerrará');
  },
};

function showNow(ctx) {
  ctx.desktop.show({ track: ctx.playlist.current(), playing: ctx.audio.isPlaying() });
}
