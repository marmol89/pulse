import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UNKNOWN_ARTIST } from '../library/tracks.js';
import { TransientError } from './http.js';
import { searchItunes } from './itunes.js';
import { searchDeezer } from './deezer.js';
import { findLyrics } from './lrclib.js';
import { isTitleFromFile, pickBestOf, queriesFromRecord } from './matching.js';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
/**
 * Versión de la búsqueda. Al mejorarla (2: Deezer y nombres "Título - Artista"), lo que no se
 * encontró con una versión anterior se vuelve a buscar una vez.
 */
const LOOKUP_VERSION = 2;

const outdated = (version) => (version ?? 1) < LOOKUP_VERSION;

/** A la pista le falta algo que internet puede aportar y todavía no se ha buscado (con esta versión). */
export function needsInfo(record) {
  const { online } = record;
  if (online?.checkedAt && !(online.status === 'not-found' && outdated(online.version))) return false;
  const hasCover = record.hasCover || Boolean(record.coverFile);
  return !hasCover || !record.album || !record.genre || !record.year || isTitleFromFile(record);
}

/**
 * Completa registros de la biblioteca con iTunes (datos y carátula), Deezer si iTunes no tiene la
 * canción (datos y carátula, sin género ni año) y LRCLIB (letra).
 * Nunca pisa las etiquetas del archivo: solo rellena lo que falta.
 */
export function createEnricher({ http, coversDir, now = Date.now }) {
  return {
    /**
     * @returns {Promise<{ record: object, changed: boolean }>}
     * @throws {TransientError} sin red o servicio no disponible: reintentar más tarde
     */
    async enrich(record, { force = false, lyrics = false } = {}) {
      let updated = record;
      if (force || needsInfo(record)) updated = await lookupInfo(updated);
      const lyricsPending = !updated.online?.lyricsCheckedAt || outdated(updated.online.lyricsVersion);
      if (lyrics && !updated.lyrics && (force || lyricsPending)) updated = await lookupLyrics(updated);
      return { record: updated, changed: updated !== record };
    },
  };

  async function lookupInfo(record) {
    // Las lecturas del nombre tienen las mismas palabras: una búsqueda por servicio vale para todas.
    const queries = queriesFromRecord(record);
    let match = pickBestOf(queries, await orFallback(() => searchItunes(http, queries[0]), []));
    match ??= pickBestOf(queries, await orFallback(() => searchDeezer(http, queries[0]), []));
    const online = { ...record.online, checkedAt: now(), version: LOOKUP_VERSION };
    if (!match) return { ...record, online: { ...online, status: 'not-found', source: null } };
    const coverFile = record.hasCover ? (record.coverFile ?? null) : ((await saveCover(match.artworkUrl)) ?? record.coverFile ?? null);
    return { ...merge(record, match), coverFile, online: { ...online, status: 'found', source: match.source, url: match.url } };
  }

  // Con los datos ya completados, o con las lecturas del nombre del archivo si no se encontraron.
  async function lookupLyrics(record) {
    let text = null;
    for (const query of queriesFromRecord(record)) {
      text = await orFallback(() => findLyrics(http, query), null);
      if (text) break;
    }
    const online = { ...record.online, lyricsSource: text ? 'LRCLIB' : null, lyricsCheckedAt: now(), lyricsVersion: LOOKUP_VERSION };
    return { ...record, lyrics: text ?? '', online };
  }

  /** Guarda la carátula en la caché. Las pistas de un mismo álbum comparten archivo. */
  async function saveCover(url) {
    if (!url) return null;
    const file = path.join(coversDir, `${createHash('sha1').update(url).digest('hex')}.jpg`);
    if (await exists(file)) return file;
    const image = await orFallback(() => http.image(url, MAX_COVER_BYTES), null);
    if (!image) return null;
    await mkdir(coversDir, { recursive: true });
    await writeFile(file, image.data);
    return file;
  }
}

/** Solo rellena huecos; el título y el artista solo se cambian si venían del nombre del archivo. */
function merge(record, match) {
  const fromFile = isTitleFromFile(record);
  const unknownArtist = !record.artist || record.artist === UNKNOWN_ARTIST;
  return {
    ...record,
    title: fromFile ? match.title : record.title,
    titleFromFile: false,
    artist: fromFile || unknownArtist ? match.artist : record.artist,
    albumArtist: record.albumArtist || match.albumArtist,
    album: record.album || match.album,
    genre: record.genre || match.genre,
    year: record.year || match.year,
    trackNo: record.trackNo || match.trackNo,
    trackCount: record.trackCount || match.trackCount,
    disc: record.disc || match.disc,
    duration: record.duration || match.duration,
  };
}

/** Un fallo pasajero se propaga (se reintentará); cualquier otro cuenta como "no encontrado". */
async function orFallback(task, fallback) {
  try {
    return await task();
  } catch (error) {
    if (error instanceof TransientError) throw error;
    return fallback;
  }
}

function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}
