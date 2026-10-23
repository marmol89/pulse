import { Colleague } from '../core/Colleague.js';

const ONLINE_LOOKUP_KEY = 'onlineLookup';

/** Preferencias del usuario. Persistido. Modelo puro: no emite eventos. */
export class Settings extends Colleague {
  #storage;
  #onlineLookup;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#onlineLookup = storage.get(ONLINE_LOOKUP_KEY, true) !== false;
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
