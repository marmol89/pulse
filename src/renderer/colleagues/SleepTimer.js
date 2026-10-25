import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

/**
 * Temporizador de apagado: parar la música dentro de unos minutos o al acabar la canción que suena.
 * Servicio con su propio reloj (inyectable en los tests). Emite: sleep-timer-ended (se acabó el tiempo).
 * El modo "al acabar esta canción" no tiene reloj: lo resuelve el handler con `ended`.
 */
export class SleepTimer extends Colleague {
  #timers;
  #now;
  #timer = null;
  #state = { mode: 'off', endsAt: 0 };

  constructor({ timers = globalThis, now = Date.now } = {}) {
    super();
    this.#timers = timers;
    this.#now = now;
  }

  /** Parar dentro de `minutes` minutos. */
  start(minutes) {
    this.cancel();
    const delay = Math.max(1, minutes) * 60_000;
    this.#state = { mode: 'minutes', endsAt: this.#now() + delay };
    this.#timer = this.#timers.setTimeout(() => {
      this.#timer = null;
      this.#state = { mode: 'off', endsAt: 0 };
      this.notify(EVENTS.SLEEP_TIMER_ENDED);
    }, delay);
  }

  /** Parar cuando acabe la canción que suena. */
  startEndOfTrack() {
    this.cancel();
    this.#state = { mode: 'track', endsAt: 0 };
  }

  cancel() {
    if (this.#timer) this.#timers.clearTimeout(this.#timer);
    this.#timer = null;
    this.#state = { mode: 'off', endsAt: 0 };
  }

  /** { mode: 'off' | 'minutes' | 'track', endsAt } (endsAt: marca de tiempo en el modo 'minutes'). */
  state() {
    return { ...this.#state };
  }
}
