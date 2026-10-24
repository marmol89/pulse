import { basename, extname } from '../paths.js';
import { selectCover } from 'music-metadata';

export const AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'webm'];
const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS.map((extension) => `.${extension}`));
export const UNKNOWN_ARTIST = 'Artista desconocido';

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm',
};

/** Tipo MIME de un archivo de audio por su extensión. */
export function mimeFor(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Extensión de audio admitida y no es un archivo "._" de macOS. Vale para rutas y claves de S3. */
export function isAudioFile(name) {
  const base = basename(name);
  return !base.startsWith('._') && AUDIO_EXTENSION_SET.has(extname(base).toLowerCase());
}

/** Registro mínimo de una pista: el título sale del nombre del archivo. */
export function baseRecord(id, fileName, fields = {}) {
  return {
    path: id,
    title: basename(fileName, extname(fileName)),
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

/**
 * Registro persistido → pista para la interfaz. Las URLs del audio y de la carátula las pone
 * cada plataforma (`urls`: media:// en Electron, URL firmada y archivo local en Android);
 * `urls.cover` solo se pide si la pista tiene carátula (incrustada o de internet).
 * @param {{ track: (record) => string, cover: (record) => string }} urls
 */
export function toTrack(record, urls) {
  const { hasCover, coverName, titleFromFile, key, etag, size, ...fields } = record;
  return {
    ...fields,
    trackCount: fields.trackCount ?? 0,
    online: fields.online ?? null,
    url: urls.track(record),
    cover: hasCover || coverName ? urls.cover(record) : null,
  };
}

/** Versión de la carátula de internet: si se vuelve a buscar, la vista no usa la de la caché. */
export function coverVersion(record) {
  return record.hasCover ? '' : `?v=${record.online?.checkedAt ?? 0}`;
}

/**
 * Carátula de un registro: la incrustada (con `readEmbedded`) o, si no tiene, la descargada de internet
 * (`readCover(coverName)` → Uint8Array o null: de la caché local o de metadatos/caratulas/ en el bucket).
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
