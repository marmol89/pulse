import path from 'node:path';
import { selectCover } from 'music-metadata';
import { mediaUrl } from '../protocol/urls.js';

export const AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'webm'];
const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS.map((extension) => `.${extension}`));
export const UNKNOWN_ARTIST = 'Artista desconocido';

/** Extensión de audio admitida y no es un archivo "._" de macOS. Vale para rutas y claves de S3. */
export function isAudioFile(name) {
  const base = path.posix.basename(String(name).replace(/\\/g, '/'));
  return !base.startsWith('._') && AUDIO_EXTENSION_SET.has(path.posix.extname(base).toLowerCase());
}

/** Registro mínimo de una pista: el título sale del nombre del archivo. */
export function baseRecord(id, fileName, fields = {}) {
  return {
    path: id,
    title: path.posix.basename(fileName, path.posix.extname(fileName)),
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
    ...fields,
  };
}

/** Completa el registro con las etiquetas leídas por music-metadata. */
export function recordFromMetadata(record, { common, format }) {
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
}

/** Carátula incrustada en unas etiquetas, o null. */
export function pictureFrom(common) {
  const cover = selectCover(common?.picture);
  return cover ? { format: imageMime(cover.format), data: cover.data } : null;
}

/** Registro persistido → pista para el renderer (con URLs media://). */
export function toTrack({ hasCover, coverName, titleFromFile, key, etag, size, ...record }) {
  return {
    ...record,
    trackCount: record.trackCount ?? 0,
    online: record.online ?? null,
    url: mediaUrl('track', record.path),
    cover: coverUrl(record, hasCover, coverName),
  };
}

function coverUrl(record, hasCover, coverName) {
  if (hasCover) return mediaUrl('cover', record.path);
  // La de internet lleva versión: si se vuelve a buscar, la vista no usa la de la caché.
  if (coverName) return `${mediaUrl('cover', record.path)}?v=${record.online?.checkedAt ?? 0}`;
  return null;
}

/**
 * Carátula de un registro: la incrustada (con `readEmbedded`) o, si no tiene, la descargada de internet
 * (`readCover(coverName)` → Buffer o null: de la caché local o de metadatos/caratulas/ en el bucket).
 */
export async function readRecordCover(record, { readEmbedded, readCover }) {
  if (!record) return null;
  if (record.hasCover) {
    const embedded = await readEmbedded(record).catch(() => null);
    if (embedded) return embedded;
  }
  if (!record.coverName) return null;
  const data = await readCover(record.coverName).catch(() => null);
  if (!data?.length) return null; // sin caché ni copia en el bucket: se usará la portada generada
  return { format: data[0] === 0x89 && data[1] === 0x50 ? 'image/png' : 'image/jpeg', data };
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
