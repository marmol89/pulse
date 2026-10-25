import { Colleague } from '../core/Colleague.js';

const REPEAT_MODES = ['off', 'all', 'one'];

/**
 * Cola de reproducción: qué suena ahora y qué viene después.
 * Es la fuente de verdad del orden, el modo aleatorio y el modo repetir.
 * Modelo puro: no emite eventos.
 */
export class Playlist extends Colleague {
  /** Pistas en su orden original. */
  #tracks = [];
  /** Orden de reproducción: índices sobre #tracks (secuencial o barajado). */
  #order = [];
  /** Posición actual dentro de #order (-1 si la cola está vacía). */
  #position = -1;
  #shuffle = false;
  #repeat = 'off';
  #random;

  constructor({ random = Math.random } = {}) {
    super();
    this.#random = random;
  }

  /** Sustituye la cola. Empieza por `startPath` si está en ella. Devuelve la pista actual. */
  setQueue(tracks, startPath = null) {
    this.#tracks = [...tracks];
    const start = startPath == null ? -1 : this.#tracks.findIndex((track) => track.path === startPath);
    this.#rebuildOrder(start);
    return this.current();
  }

  tracks() {
    return [...this.#tracks];
  }

  /**
   * Quita pistas de la cola sin cambiar el orden del resto. Si se quita la actual, pasa a ser
   * actual la siguiente (ninguna si era la última). Devuelve si se ha quitado la actual.
   */
  remove(paths) {
    const removed = new Set(paths);
    const currentIndex = this.index();
    const currentRemoved = currentIndex >= 0 && removed.has(this.#tracks[currentIndex].path);
    const newIndex = [];
    let kept = 0;
    for (const track of this.#tracks) newIndex.push(removed.has(track.path) ? -1 : kept++);
    const keptBefore = this.#order.slice(0, Math.max(this.#position, 0)).filter((index) => newIndex[index] >= 0).length;
    this.#tracks = this.#tracks.filter((track) => !removed.has(track.path));
    this.#order = this.#order.map((index) => newIndex[index]).filter((index) => index >= 0);
    if (this.#position >= 0) this.#position = keptBefore < this.#order.length ? keptBefore : -1;
    return currentRemoved;
  }

  /** Sustituye una pista de la cola por su versión actualizada (misma ruta), sin cambiar el orden. */
  replace(track) {
    const index = this.#tracks.findIndex((candidate) => candidate.path === track.path);
    if (index >= 0) this.#tracks[index] = track;
    return index >= 0;
  }

  size() {
    return this.#tracks.length;
  }

  /** Índice de la pista actual en el orden original (-1 si no hay). */
  index() {
    return this.#position < 0 ? -1 : this.#order[this.#position];
  }

  current() {
    const index = this.index();
    return index < 0 ? null : this.#tracks[index];
  }

  next() {
    if (this.#position < 0) return null;
    if (this.#position < this.#order.length - 1) this.#position += 1;
    else if (this.#repeat === 'off') return null;
    else this.#position = 0;
    return this.current();
  }

  previous() {
    if (this.#position < 0) return null;
    if (this.#position > 0) this.#position -= 1;
    else if (this.#repeat === 'off') return null;
    else this.#position = this.#order.length - 1;
    return this.current();
  }

  /** La que sonará al terminar la actual (como nextOnEnded, pero sin avanzar), o null. */
  upcoming() {
    if (this.#position < 0) return null;
    if (this.#repeat === 'one') return this.current();
    if (this.#position < this.#order.length - 1) return this.#tracks[this.#order[this.#position + 1]];
    return this.#repeat === 'all' ? this.#tracks[this.#order[0]] : null;
  }

  /** Siguiente pista al terminar la actual, según el modo repetir. */
  nextOnEnded() {
    return this.#repeat === 'one' ? this.current() : this.next();
  }

  isShuffle() {
    return this.#shuffle;
  }

  repeatMode() {
    return this.#repeat;
  }

  toggleShuffle() {
    return this.setShuffle(!this.#shuffle);
  }

  /** Activa o desactiva el aleatorio sin cambiar la pista que suena. */
  setShuffle(enabled) {
    if (Boolean(enabled) === this.#shuffle) return this.#shuffle;
    const current = this.index();
    this.#shuffle = Boolean(enabled);
    this.#rebuildOrder(current);
    return this.#shuffle;
  }

  /** off → all → one → off. Devuelve el modo nuevo. */
  cycleRepeat() {
    this.#repeat = REPEAT_MODES[(REPEAT_MODES.indexOf(this.#repeat) + 1) % REPEAT_MODES.length];
    return this.#repeat;
  }

  /** Reconstruye el orden dejando `startIndex` como pista actual (si es válido). */
  #rebuildOrder(startIndex) {
    const indices = this.#tracks.map((_, index) => index);
    if (indices.length === 0) {
      this.#order = [];
      this.#position = -1;
      return;
    }
    if (!this.#shuffle) {
      this.#order = indices;
      this.#position = Math.max(startIndex, 0);
      return;
    }
    this.#order = this.#shuffled(indices.filter((index) => index !== startIndex));
    if (startIndex >= 0) this.#order.unshift(startIndex);
    this.#position = 0;
  }

  /** Fisher–Yates. */
  #shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.#random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
