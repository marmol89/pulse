import { Colleague } from '../core/Colleague.js';

const STORAGE_KEY = 'recents';
const LIMIT = 12;

/** "Escuchado recientemente": últimas rutas reproducidas, sin duplicados. Persistido. */
export class Recents extends Colleague {
  #paths;
  #storage;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#paths = storage.get(STORAGE_KEY, []).slice(0, LIMIT);
  }

  add(path) {
    this.#paths = [path, ...this.#paths.filter((existing) => existing !== path)].slice(0, LIMIT);
    this.#storage.set(STORAGE_KEY, this.#paths);
  }

  /** Rutas, la más reciente primero. */
  list() {
    return [...this.#paths];
  }
}
