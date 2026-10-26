import { normalize } from './text.js';

/**
 * Listas M3U (.m3u / .m3u8): exportar una colección e importarla buscando sus canciones en la biblioteca.
 * La ruta que se escribe es la clave del archivo en el bucket o en las carpetas ("Disco/01.mp3"): sirve para
 * volver a importarla en otro Pulse y para que otros reproductores la reconozcan si tienen la misma carpeta.
 */

/** "s3://bucket/Disco/01.mp3" → "Disco/01.mp3". */
export function trackKey(path) {
  return String(path).replace(/^[a-z0-9]+:\/\/[^/]+\//i, '');
}

const clean = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/** @param {{ path: string, title: string, artist: string, duration: number }[]} tracks */
export function toM3U(tracks) {
  const lines = ['#EXTM3U'];
  for (const track of tracks) {
    const seconds = Number.isFinite(track.duration) && track.duration > 0 ? Math.round(track.duration) : -1;
    const label = [clean(track.artist), clean(track.title)].filter(Boolean).join(' - ');
    lines.push(`#EXTINF:${seconds},${label}`, trackKey(track.path));
  }
  return `${lines.join('\n')}\n`;
}

/** Entradas de un M3U: { location, label } (label: "Artista - Título" de #EXTINF, o ''). */
export function parseM3U(text) {
  const entries = [];
  let label = '';
  for (const raw of String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const info = /^#EXTINF:[^,]*,(.*)$/i.exec(line);
      if (info) label = info[1].trim();
      continue;
    }
    entries.push({ location: line, label });
    label = '';
  }
  return entries;
}

/** Partes de una ruta, sin "file://", sin unidad de Windows y con "/": "C:\\Música\\a.mp3" → ["música", "a.mp3"]. */
function segments(location) {
  let path = location.replace(/^file:\/\/\/?/i, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    // ya venía sin codificar
  }
  return path
    .replace(/\\/g, '/')
    .replace(/^[a-z]:\//i, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map(normalize);
}

/**
 * Busca cada entrada en la biblioteca: por la ruta más larga que coincida con el final de la clave (así una ruta
 * absoluta de otro equipo encuentra "Disco/01.mp3"; si empatan varias, como "01.mp3" de dos discos, no vale ninguna)
 * y si no, por "Artista - Título".
 * @returns {{ paths: string[], missing: string[] }} `paths` sin repetir y en orden; `missing`: lo que no está.
 */
export function matchEntries(entries, tracks) {
  const byKey = tracks.map((track) => ({ path: track.path, parts: segments(trackKey(track.path)) }));
  const byLabel = new Map(tracks.map((track) => [normalize(`${track.artist} - ${track.title}`), track.path]));
  const paths = [];
  const missing = [];
  for (const entry of entries) {
    const path = matchPath(segments(entry.location), byKey) ?? byLabel.get(normalize(entry.label)) ?? null;
    if (!path) missing.push(entry.label || entry.location);
    else if (!paths.includes(path)) paths.push(path);
  }
  return { paths, missing };
}

function matchPath(parts, byKey) {
  let best = null;
  let bestLength = 0;
  for (const { path, parts: key } of byKey) {
    let length = 0;
    while (length < parts.length && length < key.length && parts.at(-1 - length) === key.at(-1 - length)) length++;
    if (length > bestLength) [best, bestLength] = [path, length];
    else if (length === bestLength && length > 0) best = null; // empate: ambigua
  }
  return best;
}
