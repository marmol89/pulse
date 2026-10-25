import { Colleague } from '../core/Colleague.js';

/**
 * Canciones descargadas en el dispositivo para escucharlas sin conexión (solo donde la plataforma lo permite:
 * Android). Copia del estado que manda la plataforma. Modelo puro: no emite eventos.
 */
export class Downloads extends Colleague {
  #supported = false;
  #paths = new Set();
  #pending = new Set();
  #failed = 0;
  #bytes = 0;

  /** @param {{ paths: string[], pending: string[], bytes: number }} summary */
  set(summary) {
    this.#supported = true;
    this.#paths = new Set(summary?.paths ?? []);
    this.#pending = new Set(summary?.pending ?? []);
    this.#bytes = summary?.bytes ?? 0;
    this.#failed = summary?.failed?.length ?? 0;
  }

  supported() {
    return this.#supported;
  }

  /** 'downloading' si alguna está en cola, 'all' si están todas y 'none' si no (o no hay canciones). */
  stateOf(paths) {
    if (paths.some((path) => this.#pending.has(path))) return 'downloading';
    return paths.length > 0 && paths.every((path) => this.#paths.has(path)) ? 'all' : 'none';
  }

  pendingCount() {
    return this.#pending.size;
  }

  /** Las que no se pudieron descargar en esta sesión. */
  failedCount() {
    return this.#failed;
  }

  summary() {
    return { count: this.#paths.size, bytes: this.#bytes, pending: this.#pending.size };
  }
}
