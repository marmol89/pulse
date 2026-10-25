import { EVENTS } from '../events.js';

/**
 * Retomar donde lo dejaste: la cola, sus modos y el segundo de la pista se guardan en Session
 * mientras suena. Al abrir Pulse se restauran en handlers/library.js (restoreSession), con la biblioteca ya cargada.
 */
const saveQueue = (ctx) => ctx.session.saveQueue(ctx.playlist.snapshot());

export default {
  [EVENTS.TRACK_STARTED]: saveQueue,
  [EVENTS.NEXT]: saveQueue,
  [EVENTS.PREVIOUS]: saveQueue,
  [EVENTS.ENDED]: saveQueue,
  [EVENTS.TOGGLE_SHUFFLE]: saveQueue,
  [EVENTS.CYCLE_REPEAT]: saveQueue,
  [EVENTS.LIBRARY_CHANGED]: saveQueue,
  [EVENTS.PLAY_NEXT]: saveQueue,
  [EVENTS.ENQUEUE]: saveQueue,
  [EVENTS.REMOVE_FROM_QUEUE]: saveQueue,
  [EVENTS.MOVE_IN_QUEUE]: saveQueue, // pueden haber quitado pistas de la cola

  [EVENTS.TIME_UPDATE](ctx, { current }) {
    ctx.session.saveTime(current);
  },

  // Al pausar se guarda al momento: es cuando más probable es que se cierre la app.
  [EVENTS.STATE_CHANGE](ctx, { playing }) {
    if (!playing) ctx.session.saveTime(ctx.audio.currentTime(), { force: true });
  },
};
