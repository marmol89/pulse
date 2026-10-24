import path from 'node:path';
import { parseMediaUrl } from './urls.js';

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

export function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Responde con un objeto del bucket (o el rango pedido), como espera el <audio> para poder saltar.
 * S3 resuelve los rangos; aquí solo se traducen su respuesta y sus errores.
 */
export async function objectResponse(storage, key, rangeHeader) {
  try {
    const object = await storage.getObject(key, rangeHeader);
    const headers = { 'Content-Type': mimeFor(key), 'Accept-Ranges': 'bytes' };
    if (object.contentLength != null) headers['Content-Length'] = String(object.contentLength);
    if (object.contentRange) headers['Content-Range'] = object.contentRange;
    return new Response(object.body, { status: object.status, headers });
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 416 || error?.name === 'InvalidRange') return new Response(null, { status: 416 });
    if (status === 404 || error?.name === 'NoSuchKey') return new Response('No encontrado', { status: 404 });
    return new Response('Almacenamiento no disponible', { status: 502 });
  }
}

/** @param {{ format: string, data: Uint8Array } | null} picture */
export function pictureResponse(picture) {
  if (!picture) return new Response('Sin carátula', { status: 404 });
  return new Response(picture.data, {
    headers: { 'Content-Type': picture.format, 'Cache-Control': 'max-age=86400' },
  });
}

/**
 * Responde a una URL media://. Solo sirve pistas que estén en la biblioteca (`isAllowed`),
 * así el renderer no puede pedir objetos arbitrarios. `openTrack(id, rango)` da el audio.
 */
export async function respondToMedia(url, rangeHeader, { isAllowed, readCover, openTrack }) {
  const target = parseMediaUrl(url);
  if (!target || !isAllowed(target.path)) return new Response('Prohibido', { status: 403 });
  if (target.kind === 'track') return openTrack(target.path, rangeHeader);
  if (target.kind === 'cover') return pictureResponse(await readCover(target.path));
  return new Response('No encontrado', { status: 404 });
}
