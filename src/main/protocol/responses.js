import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
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
 * Interpreta una cabecera Range de un único rango ("bytes=0-", "bytes=10-99", "bytes=-500").
 * @returns {{ start: number, end: number } | null | false}
 *   el rango; null si no hay rango utilizable (se sirve todo); false si no es satisfacible (416).
 */
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const [, startText, endText] = match;
  let start;
  let end;
  if (startText === '') {
    const suffix = Number(endText);
    if (suffix === 0) return false;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  }
  return start >= size || start > end ? false : { start, end };
}

/** Sirve un archivo con soporte de rangos (imprescindible para poder saltar en el audio). */
export async function streamFile(filePath, rangeHeader) {
  let size;
  try {
    ({ size } = await stat(filePath));
  } catch {
    return new Response('No encontrado', { status: 404 });
  }
  const headers = { 'Content-Type': mimeFor(filePath), 'Accept-Ranges': 'bytes' };
  if (size === 0) return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } });

  const range = parseRange(rangeHeader, size);
  if (range === false) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers['Content-Length'] = String(end - start + 1);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
    status: range ? 206 : 200,
    headers,
  });
}

/** @param {{ format: string, data: Uint8Array } | null} picture */
export function pictureResponse(picture) {
  if (!picture) return new Response('Sin carátula', { status: 404 });
  return new Response(picture.data, {
    headers: { 'Content-Type': picture.format, 'Cache-Control': 'max-age=86400' },
  });
}

/**
 * Responde a una URL media://. Solo sirve rutas que estén en la biblioteca
 * (`isAllowed`), así el renderer no puede leer archivos arbitrarios del disco.
 */
export async function respondToMedia(url, rangeHeader, { isAllowed, readCover }) {
  const target = parseMediaUrl(url);
  if (!target || !isAllowed(target.path)) return new Response('Prohibido', { status: 403 });
  if (target.kind === 'track') return streamFile(target.path, rangeHeader);
  if (target.kind === 'cover') return pictureResponse(await readCover(target.path));
  return new Response('No encontrado', { status: 404 });
}
