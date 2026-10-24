import { coverVersion, toTrack } from '../../backend/library/tracks.js';

export const MEDIA_SCHEME = 'media';

/** media://track/<ruta codificada> (audio) o media://cover/<ruta codificada> (carátula). */
export function mediaUrl(kind, filePath) {
  return `${MEDIA_SCHEME}://${kind}/${encodeURIComponent(filePath)}`;
}

/** URLs de Electron: todo pasa por el protocolo media:// (ver media.js). */
export const MEDIA_URLS = {
  track: (record) => mediaUrl('track', record.path),
  cover: (record) => `${mediaUrl('cover', record.path)}${coverVersion(record)}`,
};

/** Registro → pista para la ventana, con URLs media://. */
export function mediaTrack(record) {
  return toTrack(record, MEDIA_URLS);
}

/** Inversa de mediaUrl(). Devuelve { kind, path } o null si la URL no es válida. */
export function parseMediaUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null;
    const path = decodeURIComponent(parsed.pathname.slice(1));
    return path ? { kind: parsed.hostname, path } : null;
  } catch {
    return null;
  }
}
