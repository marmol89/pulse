import { Colleague } from '../core/Colleague.js';

const ONLINE_LOOKUP_KEY = 'onlineLookup';
const LIBRARY_SORT_KEY = 'librarySort';

/** Preferencias del usuario (persistidas) y de dónde sale la música. Modelo puro: no emite eventos. */
export class Settings extends Colleague {
  #storage;
  #onlineLookup;
  #librarySort;
  #source = null;

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

  /** De dónde sale la música: 's3', 'local' (carpetas del equipo, de solo lectura) o null si aún no se sabe. No se guarda. */
  source() {
    return this.#source;
  }

  setSource(mode) {
    this.#source = mode === 's3' || mode === 'local' ? mode : null;
    return this.#source;
  }

  /** ¿Se pueden eliminar o descargar canciones? Con las carpetas del equipo, no: Pulse nunca toca esos archivos. */
  isReadOnly() {
    return this.#source === 'local';
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
