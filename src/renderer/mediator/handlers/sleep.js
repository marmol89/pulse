import { EVENTS } from '../events.js';

const FADE_MS = 4000;

/** Temporizador de apagado: dentro de unos minutos (con fundido) o al acabar la canción que suena. */
export default {
  [EVENTS.SET_SLEEP_TIMER](ctx, choice) {
    if (choice === 'track') ctx.sleepTimer.startEndOfTrack();
    else if (choice > 0) ctx.sleepTimer.start(choice);
    else ctx.sleepTimer.cancel();
    showTimer(ctx);
    ctx.toast.show(message(choice));
  },

  async [EVENTS.SLEEP_TIMER_ENDED](ctx) {
    showTimer(ctx);
    await ctx.audio.fadeOut(FADE_MS);
  },

  // handlers/navigation.js ya ha cargado la siguiente: queda lista, en pausa.
  [EVENTS.ENDED](ctx) {
    if (ctx.sleepTimer.state().mode !== 'track') return;
    ctx.sleepTimer.cancel();
    ctx.audio.pause();
    showTimer(ctx);
  },
};

function showTimer(ctx) {
  ctx.nowPlaying.setSleepTimer(ctx.sleepTimer.state());
}

function message(choice) {
  if (choice === 'track') return 'La música se parará al acabar esta canción';
  if (choice > 0) return choice >= 60 && choice % 60 === 0 ? `La música se parará en ${choice / 60} h` : `La música se parará en ${choice} min`;
  return 'Temporizador desactivado';
}
