import { Colleague } from '../core/Colleague.js';

const STORAGE_KEY = 'session';
const TIME_INTERVAL_MS = 5000; // el segundo de la pista se guarda como mucho cada 5 s

/**
 * Lo que sonaba al cerrar Pulse, para retomarlo al abrir: la cola (Playlist.snapshot()), de dónde
 * venía ("Mix diario", un álbum…) y el segundo de la pista. Persistido. Modelo puro: no emite eventos.
 */
export class Session extends Colleague {
  #storage;
  #state;
  #lastTimeAt = Number.NEGATIVE_INFINITY;

  constructor(storage) {
    super();
    this.#storage = storage;
    const saved = storage.get(STORAGE_KEY, null);
    this.#state = saved && Array.isArray(saved.queue?.paths) ? saved : null;
  }

  /** La sesión guardada ({ queue, context, time }) o null. */
  load() {
    return this.#state ? structuredClone(this.#state) : null;
  }

  /** Guarda la cola; sin `context`, conserva el de antes. Una cola vacía borra la sesión. */
  saveQueue(queue, context = this.#state?.context ?? '') {
    if (!queue || queue.position < 0 || queue.paths.length === 0) {
      this.clear();
      return;
    }
    // Misma pista: se conserva el segundo guardado; otra, empieza de cero.
    const time = this.#state && currentPath(this.#state.queue) === currentPath(queue) ? this.#state.time : 0;
    this.#state = { queue, context, time };
    this.#write();
  }

  /** Guarda el segundo de la pista actual (como mucho cada 5 s, salvo con `force`). */
  saveTime(seconds, { force = false, now = Date.now() } = {}) {
    if (!this.#state || !(seconds >= 0)) return;
    this.#state.time = seconds;
    if (!force && now - this.#lastTimeAt < TIME_INTERVAL_MS) return;
    this.#lastTimeAt = now;
    this.#write();
  }

  clear() {
    this.#state = null;
    this.#storage.set(STORAGE_KEY, null);
  }

  #write() {
    this.#storage.set(STORAGE_KEY, this.#state);
  }
}

function currentPath({ paths, order, position }) {
  return paths[order[position]];
}
