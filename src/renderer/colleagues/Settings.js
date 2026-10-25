import { Colleague } from '../core/Colleague.js';

const ONLINE_LOOKUP_KEY = 'onlineLookup';
const LIBRARY_SORT_KEY = 'librarySort';

/** Preferencias del usuario. Persistido. Modelo puro: no emite eventos. */
export class Settings extends Colleague {
  #storage;
  #onlineLookup;
  #librarySort;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#onlineLookup = storage.get(ONLINE_LOOKUP_KEY, true) !== false;
    this.#librarySort = storage.get(LIBRARY_SORT_KEY, null);
  }

  /** Orden elegido para "Tu biblioteca" (null: el de siempre, las añadidas recientemente primero). */
  librarySort() {
    return this.#librarySort;
  }

  setLibrarySort(sort) {
    this.#librarySort = sort ? String(sort) : null;
    this.#storage.set(LIBRARY_SORT_KEY, this.#librarySort);
    return this.#librarySort;
  }

  /** Buscar carátulas e información en internet (activado por defecto). */
  onlineLookup() {
    return this.#onlineLookup;
  }

  setOnlineLookup(enabled) {
    this.#onlineLookup = Boolean(enabled);
    this.#storage.set(ONLINE_LOOKUP_KEY, this.#onlineLookup);
    return this.#onlineLookup;
  }
}
