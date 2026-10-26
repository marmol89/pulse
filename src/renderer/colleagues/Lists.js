import { Colleague } from '../core/Colleague.js';

/**
 * Listas de canciones creadas por el usuario (no confundir con Playlist, la cola de reproducción).
 * Las guarda y sincroniza el proceso main (en el bucket, compartidas con los demás equipos):
 * aquí solo está la última copia recibida. Modelo puro: no emite eventos.
 * Cada lista: { id, name, tracks: id[], createdAt, updatedAt }.
 */
export class Lists extends Colleague {
  #lists = [];

  set(lists) {
    this.#lists = Array.isArray(lists) ? lists : [];
  }

  /** En orden de creación. */
  all() {
    return [...this.#lists];
  }

  get(id) {
    return this.#lists.find((list) => list.id === id) ?? null;
  }

  /** ¿Está ya la pista en la lista? */
  includes(id, path) {
    return this.get(id)?.tracks.includes(path) ?? false;
  }

  /** `name` si no hay otra lista que se llame así (sin mirar mayúsculas); si no, "name (2)", "name (3)"… */
  freeName(name) {
    const taken = new Set(this.#lists.map((list) => list.name.toLowerCase()));
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
    return candidate;
  }
}
