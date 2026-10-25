import { mimeFor } from '../../backend/library/tracks.js';
import { parseMediaUrl } from './urls.js';

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
    // La lee con fetch MediaSessionBridge (la página es file://, otro origen) para los controles del sistema.
    headers: { 'Content-Type': picture.format, 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' },
  });
}

/**
 * Responde a una URL media://. Solo sirve pistas que estén en la biblioteca (`isAllowed`),
 * así el renderer no puede pedir objetos arbitrarios. `openTrack(id, rango)` da el audio.
 * media://artist/<nombre> es una foto de artista: `readArtist` solo devuelve las que lo son.
 */
export async function respondToMedia(url, rangeHeader, { isAllowed, readCover, openTrack, readArtist = async () => null }) {
  const target = parseMediaUrl(url);
  if (target?.kind === 'artist') {
    const data = await readArtist(target.path);
    return data ? pictureResponse({ format: 'image/jpeg', data }) : new Response('Prohibido', { status: 403 });
  }
  if (!target || !isAllowed(target.path)) return new Response('Prohibido', { status: 403 });
  if (target.kind === 'track') return openTrack(target.path, rangeHeader);
  if (target.kind === 'cover') {
    // 503 (no 404) si no se pudo leer: la vista lo vuelve a intentar en vez de dejarla sin carátula.
    return readCover(target.path).then(pictureResponse, () => new Response('Carátula no disponible', { status: 503 }));
  }
  return new Response('No encontrado', { status: 404 });
}
