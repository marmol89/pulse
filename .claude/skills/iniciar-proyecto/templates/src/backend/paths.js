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
