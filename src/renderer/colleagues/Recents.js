import { Colleague } from '../core/Colleague.js';

/** Donde se guardaban cuando solo eran de este equipo (la más reciente primero): se suben una vez al bucket. */
const LEGACY_KEY = 'recents';
const LIMIT = 12;

/**
 * "Escuchado recientemente": últimas rutas reproducidas, sin duplicados. Las guarda y sincroniza el proceso
 * main (en el bucket, compartidas con los demás equipos): aquí está la última copia recibida, más lo que se
 * acaba de escuchar. Modelo puro: no emite eventos.
 */
export class Recents extends Colleague {
  #paths;
  #storage;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#paths = this.#legacyNewestFirst(); // hasta recibir los del bucket, los de antes siguen viéndose
  }

  add(path) {
    this.#paths = [path, ...this.#paths.filter((existing) => existing !== path)].slice(0, LIMIT);
  }

  /** Rutas, la más reciente primero. */
  list() {
    return [...this.#paths];
  }

  /** Copia recibida (la más reciente primero). */
  set(paths) {
    this.#paths = Array.isArray(paths) ? paths.slice(0, LIMIT) : [];
  }

  /** Recientes de cuando solo se guardaban en este equipo, de la más antigua a la más reciente. */
  legacy() {
    return this.#legacyNewestFirst().reverse();
  }

  /** Ya están en el bucket: no hace falta volver a subirlos. */
  forgetLegacy() {
    this.#storage.set(LEGACY_KEY, []);
  }

  #legacyNewestFirst() {
    const paths = this.#storage.get(LEGACY_KEY, []);
    return Array.isArray(paths) ? paths.slice(0, LIMIT) : [];
  }
}
