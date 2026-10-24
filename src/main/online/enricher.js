import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UNKNOWN_ARTIST } from '../library/tracks.js';
import { isMissing } from '../library/availability.js';
import { TransientError } from './http.js';
import { searchItunes } from './itunes.js';
import { findLyrics } from './lrclib.js';
import { isTitleFromFile, pickBest, queryFromRecord } from './matching.js';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** A la pista le falta algo que internet puede aportar y todavía no se ha buscado (y su archivo existe). */
export function needsInfo(record) {
  if (isMissing(record) || record.online?.checkedAt) return false;
  const hasCover = record.hasCover || Boolean(record.coverFile);
  return !hasCover || !record.album || !record.genre || !record.year || isTitleFromFile(record);
}

/**
 * Completa registros de la biblioteca con iTunes (datos y carátula) y LRCLIB (letra).
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
      if (lyrics && !updated.lyrics && (force || !updated.online?.lyricsCheckedAt)) updated = await lookupLyrics(updated);
      return { record: updated, changed: updated !== record };
    },
  };

  async function lookupInfo(record) {
    const query = queryFromRecord(record);
    const match = pickBest(query, await orFallback(() => searchItunes(http, query), []));
    const online = { ...record.online, checkedAt: now() };
    if (!match) return { ...record, online: { ...online, status: 'not-found', source: null } };
    const coverFile = record.hasCover ? (record.coverFile ?? null) : ((await saveCover(match.artworkUrl)) ?? record.coverFile ?? null);
    return { ...merge(record, match), coverFile, online: { ...online, status: 'found', source: match.source, url: match.url } };
  }

  async function lookupLyrics(record) {
    const artist = record.artist === UNKNOWN_ARTIST ? '' : record.artist;
    const text = await orFallback(() => findLyrics(http, { title: record.title, artist, duration: record.duration }), null);
    return { ...record, lyrics: text ?? '', online: { ...record.online, lyricsSource: text ? 'LRCLIB' : null, lyricsCheckedAt: now() } };
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
