import { Colleague } from '../core/Colleague.js';

/** Donde se guardaban cuando solo eran de este equipo: se suben una vez al bucket y se vacía. */
const LEGACY_KEY = 'favorites';

/**
 * Canciones marcadas con el corazón (por ruta). Las guarda y sincroniza el proceso main (en el bucket,
 * compartidas con los demás equipos): aquí está la última copia recibida, más los cambios que se acaban
 * de pedir. Modelo puro: no emite eventos.
 */
export class Favorites extends Colleague {
  #paths;
  #storage;

  constructor(storage) {
    super();
    this.#storage = storage;
    this.#paths = new Set(this.legacy()); // hasta recibir los del bucket, los de antes siguen viéndose
  }

  has(path) {
    return this.#paths.has(path);
  }

  /** Marca o desmarca (solo aquí: el proceso main lo guarda aparte). Devuelve si queda como favorita. */
  toggle(path) {
    if (this.#paths.has(path)) this.#paths.delete(path);
    else this.#paths.add(path);
    return this.#paths.has(path);
  }

  /** Rutas favoritas, las más recientes primero. */
  list() {
    return [...this.#paths].reverse();
  }

  /** Copia recibida (las más recientes primero). Devuelve las rutas que cambiaron de estado. */
  set(paths) {
    const next = new Set(Array.isArray(paths) ? [...paths].reverse() : []);
    const changed = [...this.#paths, ...next].filter((path) => this.#paths.has(path) !== next.has(path));
    this.#paths = next;
    return [...new Set(changed)];
  }

  /** Favoritos de cuando solo se guardaban en este equipo, de la más antigua a la más reciente. */
  legacy() {
    const paths = this.#storage.get(LEGACY_KEY, []);
    return Array.isArray(paths) ? paths : [];
  }

  /** Ya están en el bucket: no hace falta volver a subirlos. */
  forgetLegacy() {
    this.#storage.set(LEGACY_KEY, []);
  }
}
