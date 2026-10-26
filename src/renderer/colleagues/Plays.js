import { Colleague } from '../core/Colleague.js';

const COUNT_AFTER_SECONDS = 30; // o la mitad de la pista, si es más corta
const MAX_STEP_SECONDS = 2; // un salto mayor entre dos time-update es un "seek": no cuenta como escuchado

/**
 * Cuántas veces ha sonado cada canción (las guarda y sincroniza el proceso main, en el bucket) y si la que suena
 * ya se ha escuchado lo bastante para contar: 30 s o la mitad de la pista, lo que llegue antes, **escuchados** (saltar
 * hacia delante no cuenta). Una sola vez por reproducción. Modelo puro: no emite eventos.
 */
export class Plays extends Colleague {
  #counts = new Map();
  #listening = null; // { path, heard, last, counted }

  /** Copia recibida: { ruta: escuchas }. */
  set(counts) {
    this.#counts = new Map(Object.entries(counts && typeof counts === 'object' ? counts : {}).filter(([, count]) => Number.isInteger(count) && count > 0));
  }

  count(path) {
    return this.#counts.get(path) ?? 0;
  }

  /** Una escucha más (antes de que el bucket confirme). */
  increment(path) {
    this.#counts.set(path, this.count(path) + 1);
  }

  /** Rutas de las más escuchadas, de más a menos (las que han sonado alguna vez). */
  mostPlayed(limit = 50) {
    return [...this.#counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit)
      .map(([path]) => path);
  }

  /** Empieza a sonar una pista: se empieza a contar lo escuchado de ella. */
  started(path) {
    this.#listening = { path, heard: 0, last: null, counted: false };
  }

  /** Avance de la pista que suena. Devuelve true (una sola vez) cuando ya se ha escuchado lo bastante para contar. */
  progress(path, current, duration) {
    const listening = this.#listening;
    if (!listening || listening.path !== path || listening.counted) return false;
    const step = listening.last === null ? 0 : current - listening.last;
    if (step > 0 && step <= MAX_STEP_SECONDS) listening.heard += step;
    listening.last = current;
    const needed = duration > 0 ? Math.min(COUNT_AFTER_SECONDS, duration / 2) : COUNT_AFTER_SECONDS;
    if (listening.heard < needed) return false;
    listening.counted = true;
    return true;
  }
}
