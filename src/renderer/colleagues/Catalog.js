import { Colleague } from '../core/Colleague.js';
import { normalize, compareText } from '../lib/text.js';

/**
 * Biblioteca completa: todas las pistas conocidas, sin orden de reproducción.
 * Busca, agrupa (álbumes, artistas, géneros) y resuelve colecciones.
 * Modelo puro: no emite eventos.
 *
 * @typedef {{ path: string, url: string, cover: string|null, title: string, artist: string,
 *   albumArtist: string, album: string, genre: string, trackNo: number, disc: number,
 *   year: number, duration: number, lyrics: string }} Track
 * @typedef {{ kind: string, key?: string, sort?: string, filter?: string }} CollectionSource
 * @typedef {{ source: CollectionSource, title: string, byline: string, tracks: Track[] }} Collection
 */
export class Catalog extends Colleague {
  /** @type {Map<string, Track>} */
  #tracks = new Map();

  /** Añade o actualiza pistas. Devuelve cuántas eran nuevas. */
  add(tracks) {
    let added = 0;
    for (const track of tracks ?? []) {
      if (!track?.path) continue;
      if (!this.#tracks.has(track.path)) added += 1;
      this.#tracks.set(track.path, track);
    }
    return added;
  }

  /** Quita pistas (p. ej. archivos que ya no están en el disco). Devuelve cuántas había. */
  remove(paths) {
    let removed = 0;
    for (const path of paths) if (this.#tracks.delete(path)) removed += 1;
    return removed;
  }

  size() {
    return this.#tracks.size;
  }

  all() {
    return [...this.#tracks.values()];
  }

  get(path) {
    return this.#tracks.get(path) ?? null;
  }

  /** Pistas en el orden de `paths`, ignorando las que ya no existen. */
  byPaths(paths) {
    return paths.map((path) => this.#tracks.get(path)).filter(Boolean);
  }

  /** Coincidencia por todas las palabras en título, artista o álbum; primero las de título. */
  search(query, limit = 100) {
    const needle = normalize(query);
    if (!needle) return [];
    const terms = needle.split(/\s+/);
    return this.all()
      .map((track) => ({ track, score: matchScore(track, needle, terms) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => a.score - b.score || compareText(a.track.title, b.track.title))
      .slice(0, limit)
      .map(({ track }) => track);
  }

  /** Los `n` géneros con más pistas: [{ name, count }]. */
  topGenres(n) {
    return countBy(this.all(), (track) => track.genre)
      .sort((a, b) => b.count - a.count || compareText(a.name, b.name))
      .slice(0, n);
  }

  /** Álbumes ordenados por título: [{ key, title, artist, count, sample }]. */
  albums() {
    const groups = groupBy(this.all().filter((track) => track.album), albumKey);
    return [...groups.entries()]
      .map(([key, tracks]) => ({
        key,
        title: tracks[0].album,
        artist: albumArtistOf(tracks[0]),
        count: tracks.length,
        sample: tracks.find((track) => track.cover) ?? tracks[0],
      }))
      .sort((a, b) => compareText(a.title, b.title));
  }

  /** Artistas ordenados por nombre: [{ key, name, count, sample }]. */
  artists() {
    const groups = groupBy(this.all(), (track) => track.artist);
    return [...groups.entries()]
      .map(([key, tracks]) => ({
        key,
        name: key,
        count: tracks.length,
        sample: tracks.find((track) => track.cover) ?? tracks[0],
      }))
      .sort((a, b) => compareText(a.name, b.name));
  }

  /**
   * Toda la biblioteca en el orden elegido (`LIBRARY_SORTS`; si no, las añadidas recientemente primero)
   * y, con `filter`, solo las que tienen todas sus palabras en el título, el artista o el álbum.
   */
  library({ sort, filter = '' } = {}) {
    const terms = normalize(filter).split(/\s+/).filter(Boolean);
    const tracks = terms.length > 0 ? this.all().filter((track) => matchScore(track, terms.join(' '), terms) !== null) : this.all();
    return tracks.sort(LIBRARY_SORTS[sort] ?? LIBRARY_SORTS[DEFAULT_LIBRARY_SORT]);
  }

  /** @param {CollectionSource} source @returns {Collection} */
  collection(source) {
    const { kind, key } = source;
    switch (kind) {
      case 'library':
        return { source, title: 'Tu biblioteca', byline: 'Creado por ti', tracks: this.library(source) };
      case 'album': {
        const tracks = this.all().filter((track) => albumKey(track) === key).sort(byDiscAndNumber);
        return { source, title: tracks[0]?.album ?? '', byline: tracks[0] ? albumArtistOf(tracks[0]) : '', tracks };
      }
      case 'artist':
        return { source, title: key, byline: 'Artista', tracks: this.all().filter((track) => track.artist === key) };
      case 'genre':
        return { source, title: key, byline: 'Género', tracks: this.all().filter((track) => track.genre === key) };
      case 'search':
        return { source, title: `Resultados de «${key}»`, byline: 'Búsqueda', tracks: this.search(key) };
      default:
        return { source, title: '', byline: '', tracks: [] };
    }
  }
}

const DEFAULT_LIBRARY_SORT = 'added';
const byTitle = (a, b) => compareText(a.title, b.title);
const byAlbum = (a, b) => compareText(albumArtistOf(a), albumArtistOf(b)) || compareText(a.album, b.album) || byDiscAndNumber(a, b);

/** Órdenes de "Tu biblioteca" (la vista pone los nombres). */
const LIBRARY_SORTS = {
  added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || byTitle(a, b),
  title: (a, b) => byTitle(a, b) || compareText(a.artist, b.artist),
  artist: (a, b) => compareText(a.artist, b.artist) || byAlbum(a, b),
  album: (a, b) => compareText(a.album, b.album) || byAlbum(a, b),
  year: (a, b) => (b.year || 0) - (a.year || 0) || byAlbum(a, b),
};

export function albumKey(track) {
  return `${normalize(albumArtistOf(track))}::${normalize(track.album)}`;
}

function albumArtistOf(track) {
  return track.albumArtist || track.artist;
}

function matchScore(track, needle, terms) {
  const title = normalize(track.title);
  const haystack = `${title} ${normalize(track.artist)} ${normalize(track.album)}`;
  if (!terms.every((term) => haystack.includes(term))) return null;
  if (title.startsWith(needle)) return 0;
  if (title.includes(needle)) return 1;
  return 2;
}

function byDiscAndNumber(a, b) {
  return (a.disc || 0) - (b.disc || 0) || (a.trackNo || 0) - (b.trackNo || 0) || compareText(a.title, b.title);
}

function groupBy(tracks, keyOf) {
  const groups = new Map();
  for (const track of tracks) {
    const key = keyOf(track);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  }
  return groups;
}

function countBy(tracks, keyOf) {
  return [...groupBy(tracks.filter(keyOf), keyOf).entries()].map(([name, list]) => ({ name, count: list.length }));
}
