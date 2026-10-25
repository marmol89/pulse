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

  /** Pistas en el orden en que suenan (la actual incluida): lo que enseña "Ver la cola". */
  ordered() {
    return this.#order.map((index) => this.#tracks[index]);
  }

  /** "Reproducir a continuación": justo detrás de la actual. Devuelve cuántas se han añadido. */
  playNext(tracks) {
    return this.#insert(tracks, () => this.#position + 1);
  }

  /** "Añadir a la cola": al final, también en aleatorio (lo añadido a mano no se baraja). */
  enqueue(tracks) {
    return this.#insert(tracks, () => this.#order.length);
  }

  /** Pasa a sonar una pista que ya está en la cola, sin cambiar el orden. Devuelve la pista o null. */
  jumpTo(path) {
    const position = this.#order.findIndex((index) => this.#tracks[index].path === path);
    if (position < 0) return null;
    this.#position = position;
    return this.current();
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

  /** Estado de la cola para guardarlo y retomarlo después: { paths, order, position, shuffle, repeat }. */
  snapshot() {
    return { paths: this.#tracks.map((track) => track.path), order: [...this.#order], position: this.#position, shuffle: this.#shuffle, repeat: this.#repeat };
  }

  /**
   * Vuelve a una cola guardada con snapshot(). `trackOf(path)` da la pista actual de cada ruta; las que ya no
   * están en la biblioteca se quitan (como con remove()). Devuelve la pista actual, o null si no queda ninguna.
   */
  restore(snapshot, trackOf) {
    const paths = Array.isArray(snapshot?.paths) ? snapshot.paths : [];
    const order = Array.isArray(snapshot?.order) ? snapshot.order : [];
    const valid = order.length === paths.length && new Set(order).size === order.length && order.every((index) => Number.isInteger(index) && index >= 0 && index < paths.length);
    this.#tracks = paths.map((path) => trackOf(path) ?? { path, missing: true });
    this.#order = valid ? [...order] : paths.map((_, index) => index);
    this.#position = this.#tracks.length === 0 ? -1 : Math.min(Math.max(Number(snapshot?.position) || 0, 0), this.#tracks.length - 1);
    this.#shuffle = Boolean(snapshot?.shuffle) && valid;
    this.#repeat = REPEAT_MODES.includes(snapshot?.repeat) ? snapshot.repeat : 'off';
    this.remove(this.#tracks.filter((track) => track.missing).map((track) => track.path));
    return this.current();
  }

  /**
   * Mete pistas en el orden de reproducción, en la posición que da `at()` (se calcula después de sacar
   * las que ya estaban: una pista no se repite en la cola). La que suena no se mueve.
   */
  #insert(tracks, at) {
    const currentPath = this.current()?.path;
    const incoming = [...new Map((tracks ?? []).filter((track) => track?.path && track.path !== currentPath).map((track) => [track.path, track])).values()];
    if (incoming.length === 0) return 0;
    this.remove(incoming.map((track) => track.path));
    const first = this.#tracks.length;
    this.#tracks.push(...incoming);
    this.#order.splice(at(), 0, ...incoming.map((_, offset) => first + offset));
    if (this.#position < 0) this.#position = 0;
    return incoming.length;
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
