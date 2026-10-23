import { Colleague } from '../core/Colleague.js';

const STORAGE_KEY = 'favorites';

/** Canciones marcadas con el corazón (por ruta). Persistido. Modelo puro: no emite eventos. */
export class Favorites extends Colleague {
  #paths;
  #storage;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#paths = new Set(storage.get(STORAGE_KEY, []));
  }

  has(path) {
    return this.#paths.has(path);
  }

  /** Marca o desmarca. Devuelve si queda como favorita. */
  toggle(path) {
    if (this.#paths.has(path)) this.#paths.delete(path);
    else this.#paths.add(path);
    this.#storage.set(STORAGE_KEY, [...this.#paths]);
    return this.#paths.has(path);
  }

  /** Rutas favoritas, las más recientes primero. */
  list() {
    return [...this.#paths].reverse();
  }
}
