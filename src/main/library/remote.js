import path from 'node:path';
import { parseBuffer } from 'music-metadata';
import { baseRecord, pictureFrom, recordFromMetadata } from './tracks.js';
import { mimeFor } from '../protocol/responses.js';

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
async function parseStart(storage, { key, size }) {
  let bytes = await storage.readStart(key, Math.max(1, Math.min(HEAD_BYTES, size)));
  const tag = id3Size(bytes);
  if (tag > bytes.length && tag <= MAX_TAG_BYTES) bytes = await storage.readStart(key, Math.min(tag + 64 * 1024, size));
  return parseBuffer(bytes, { mimeType: mimeFor(key), size }, { duration: false, skipPostHeaders: true });
}

/** Registro de un objeto del bucket. Si no se pueden leer sus etiquetas, se usa el nombre. */
export async function readRemoteRecord(storage, object) {
  const record = baseRecord(trackId(storage.bucket, object.key), path.posix.basename(object.key), {
    key: object.key,
    etag: object.etag,
    size: object.size,
  });
  try {
    return recordFromMetadata(record, await parseStart(storage, object));
  } catch {
    return record;
  }
}

const coverCache = new Map();

/** Carátula incrustada de una pista del bucket, con una caché LRU pequeña. */
export async function readRemoteCover(storage, record) {
  const cacheKey = `${record.path}#${record.etag}`;
  if (coverCache.has(cacheKey)) {
    const cached = coverCache.get(cacheKey);
    coverCache.delete(cacheKey);
    coverCache.set(cacheKey, cached);
    return cached;
  }
  let picture = null;
  try {
    picture = pictureFrom((await parseStart(storage, record)).common);
  } catch {
    picture = null;
  }
  coverCache.set(cacheKey, picture);
  if (coverCache.size > COVER_CACHE_SIZE) coverCache.delete(coverCache.keys().next().value);
  return picture;
}
