/**
 * Nombres de archivo y claves de S3 con "/" (también acepta "\" de Windows), sin node:path:
 * el backend corre igual en el proceso main de Electron y en el WebView de Android.
 */

/** Último tramo de una ruta; sin `suffix` si termina en él (como path.basename). */
export function basename(name, suffix = '') {
  const base = String(name).replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? '';
  return suffix && base.endsWith(suffix) && base !== suffix ? base.slice(0, -suffix.length) : base;
}

/** Extensión con el punto (".mp3"), o "" si no tiene (como path.extname). */
export function extname(name) {
  const base = basename(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

/** Carátula de internet en los archivos de la app ("covers/<nombre>"); el nombre nunca sale de esa carpeta. */
export function coverFile(name) {
  return `covers/${basename(name)}`;
}

/** Una lista M3U es texto: un archivo más grande que esto no es una lista. */
export const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

/** Archivo .m3u8 con un nombre válido en Windows, Linux y Android a partir del de la lista. */
export function playlistFileName(name) {
  const safe = String(name ?? '').replace(/[<>:"/\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return `${safe || 'Lista'}.m3u8`;
}

/** Nombre de la lista a partir del de su archivo ("Correr.m3u8" → "Correr"). */
export function playlistName(file) {
  return basename(file).replace(/\.m3u8?$/i, '');
}
