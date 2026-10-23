import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseFile, selectCover } from 'music-metadata';
import { mediaUrl } from '../protocol/urls.js';

export const AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'webm'];
const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS.map((extension) => `.${extension}`));
export const UNKNOWN_ARTIST = 'Artista desconocido';
const PARSE_CONCURRENCY = 8;
const COVER_CACHE_SIZE = 64;

/** Extensión de audio admitida y no es un archivo "._" de macOS. */
export function isAudioFile(filePath) {
  const name = path.basename(filePath);
  return !name.startsWith('._') && AUDIO_EXTENSION_SET.has(path.extname(name).toLowerCase());
}

/** Expande carpetas recursivamente y filtra audio. Sin duplicados y en orden natural. */
export async function collectAudioFiles(paths) {
  const found = new Set();
  for (const target of paths) await collect(path.resolve(target), found);
  return [...found].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

async function collect(target, found) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return; // ruta inexistente o sin permisos: se ignora
  }
  if (info.isFile()) {
    if (isAudioFile(target)) found.add(target);
    return;
  }
  if (!info.isDirectory()) return;
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) await collect(full, found);
    else if (entry.isFile() && isAudioFile(full)) found.add(full);
  }
}

/**
 * Lee los metadatos de un archivo. Si no se pueden leer, usa el nombre del archivo.
 * El registro se persiste; la carátula no se guarda, solo si existe.
 */
export async function readTrackRecord(filePath) {
  const record = {
    path: filePath,
    title: path.basename(filePath, path.extname(filePath)),
    titleFromFile: true,
    artist: UNKNOWN_ARTIST,
    albumArtist: '',
    album: '',
    genre: '',
    trackNo: 0,
    trackCount: 0,
    disc: 0,
    year: 0,
    duration: 0,
    lyrics: '',
    hasCover: false,
  };
  try {
    const { common, format } = await parseFile(filePath);
    return {
      ...record,
      title: clean(common.title) || record.title,
      titleFromFile: !clean(common.title),
      artist: clean(common.artist) || clean(common.albumartist) || UNKNOWN_ARTIST,
      albumArtist: clean(common.albumartist),
      album: clean(common.album),
      genre: clean(common.genre?.[0]),
      trackNo: common.track?.no ?? 0,
      trackCount: common.track?.of ?? 0,
      disc: common.disk?.no ?? 0,
      year: common.year ?? 0,
      duration: format.duration ?? 0,
      lyrics: lyricsText(common.lyrics),
      hasCover: Boolean(common.picture?.length),
    };
  } catch {
    return record;
  }
}

/** Lee muchos archivos con concurrencia limitada (evita abrir miles a la vez). */
export async function readTrackRecords(filePaths, concurrency = PARSE_CONCURRENCY) {
  const records = new Array(filePaths.length);
  let next = 0;
  async function worker() {
    while (next < filePaths.length) {
      const index = next;
      next += 1;
      records[index] = await readTrackRecord(filePaths[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, filePaths.length) }, worker));
  return records;
}

/** Registro persistido → pista para el renderer (con URLs media://). */
export function toTrack({ hasCover, coverFile, titleFromFile, ...record }) {
  return {
    ...record,
    trackCount: record.trackCount ?? 0,
    online: record.online ?? null,
    url: mediaUrl('track', record.path),
    cover: coverUrl(record, hasCover, coverFile),
  };
}

function coverUrl(record, hasCover, coverFile) {
  if (hasCover) return mediaUrl('cover', record.path);
  // La de internet lleva versión: si se vuelve a buscar, la vista no usa la de la caché.
  if (coverFile) return `${mediaUrl('cover', record.path)}?v=${record.online?.checkedAt ?? 0}`;
  return null;
}

/** Carátula de un registro: la incrustada en el archivo o, si no tiene, la descargada de internet. */
export async function readRecordCover(record) {
  if (!record) return null;
  if (record.hasCover) {
    const embedded = await readCover(record.path);
    if (embedded) return embedded;
  }
  if (!record.coverFile) return null;
  try {
    const data = await readFile(record.coverFile);
    return { format: data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : 'image/jpeg', data };
  } catch {
    return null; // se borró la caché: se usará la portada generada
  }
}

const coverCache = new Map();

/** Carátula bajo demanda, con una caché LRU pequeña. @returns {{ format, data } | null} */
export async function readCover(filePath) {
  if (coverCache.has(filePath)) {
    const cached = coverCache.get(filePath);
    coverCache.delete(filePath);
    coverCache.set(filePath, cached);
    return cached;
  }
  let picture = null;
  try {
    const { common } = await parseFile(filePath, { skipPostHeaders: true });
    const cover = selectCover(common.picture);
    if (cover) picture = { format: imageMime(cover.format), data: cover.data };
  } catch {
    picture = null;
  }
  coverCache.set(filePath, picture);
  if (coverCache.size > COVER_CACHE_SIZE) coverCache.delete(coverCache.keys().next().value);
  return picture;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lyricsText(lyrics = []) {
  return lyrics
    .map((entry) => (typeof entry === 'string' ? entry : entry.text ?? entry.syncText?.map((line) => line.text).join('\n') ?? ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function imageMime(format = '') {
  return format.includes('/') ? format : `image/${format.toLowerCase() || 'jpeg'}`;
}
