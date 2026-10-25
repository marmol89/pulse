import { basename } from '../paths.js';
import { parseBuffer } from 'music-metadata';
import { baseRecord, mimeFor, pictureFrom, recordFromMetadata } from './tracks.js';

const HEAD_BYTES = 512 * 1024; // casi siempre basta para las etiquetas del principio
const MAX_TAG_BYTES = 16 * 1024 * 1024; // una etiqueta ID3 con carátulas enormes
const COVER_CACHE_SIZE = 64;

/** Identificador de una pista del bucket: "s3://bucket/clave". */
export function trackId(bucket, key) {
  return `s3://${bucket}/${key}`;
}

export function parseTrackId(id) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(String(id));
  return match ? { bucket: match[1], key: match[2] } : null;
}

/** Tamaño total de una etiqueta ID3v2 al principio del archivo (0 si no hay). */
export function id3Size(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // "ID3"
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0);
}

/**
 * Descarga solo el principio del objeto (más si la etiqueta ID3 es grande) y lo analiza.
 * Las etiquetas guardadas al final de archivos grandes no se leen: se usa el nombre.
 */
async function readHead(storage, { key, size }) {
  const bytes = await storage.readStart(key, Math.max(1, Math.min(HEAD_BYTES, size)));
  const tag = id3Size(bytes);
  return tag > bytes.length && tag <= MAX_TAG_BYTES ? storage.readStart(key, Math.min(tag + 64 * 1024, size)) : bytes;
}

function parseHead(bytes, { key, size }) {
  return parseBuffer(bytes, { mimeType: mimeFor(key), size }, { duration: false, skipPostHeaders: true });
}

/**
 * Registro de un objeto del bucket. Si sus etiquetas no se pueden interpretar, se usa el nombre;
 * si falla la descarga (red, S3), el error se propaga para reintentarlo en otra sincronización.
 * `onPicture(registro, carátula)` recibe la carátula incrustada ya leída, para guardarla sin descargarla otra vez.
 */
export async function readRemoteRecord(storage, object, { onPicture } = {}) {
  const record = baseRecord(trackId(storage.bucket, object.key), basename(object.key), {
    key: object.key,
    etag: object.etag,
    size: object.size,
    addedAt: object.lastModified ?? 0,
  });
  const bytes = await readHead(storage, object);
  let metadata;
  try {
    metadata = await parseHead(bytes, object);
  } catch {
    return record;
  }
  const full = recordFromMetadata(record, metadata);
  const picture = onPicture && pictureFrom(metadata.common);
  if (picture) {
    try {
      await onPicture(full, picture);
    } catch {
      // Sin guardar: se descargará cuando se pida.
    }
  }
  return full;
}

const coverCache = new Map();

/**
 * Carátula incrustada de una pista del bucket, con una caché LRU pequeña. Si la descarga falla
 * (red, S3) lanza y no se recuerda: así se reintenta, en vez de quedarse sin carátula.
 */
export async function readRemoteCover(storage, record) {
  const cacheKey = `${record.path}#${record.etag}`;
  if (coverCache.has(cacheKey)) {
    const cached = coverCache.get(cacheKey);
    coverCache.delete(cacheKey);
    coverCache.set(cacheKey, cached);
    return cached;
  }
  const bytes = await readHead(storage, record);
  let picture = null;
  try {
    picture = pictureFrom((await parseHead(bytes, record)).common);
  } catch {
    picture = null; // no se puede interpretar: no tiene carátula que leer
  }
  coverCache.set(cacheKey, picture);
  if (coverCache.size > COVER_CACHE_SIZE) coverCache.delete(coverCache.keys().next().value);
  return picture;
}
