export const MEDIA_SCHEME = 'media';

/** media://track/<ruta codificada> (audio) o media://cover/<ruta codificada> (carátula). */
export function mediaUrl(kind, filePath) {
  return `${MEDIA_SCHEME}://${kind}/${encodeURIComponent(filePath)}`;
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
