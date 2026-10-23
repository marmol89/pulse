import path from 'node:path';
import { UNKNOWN_ARTIST } from '../library/tracks.js';

/**
 * Decide si un resultado de internet es la misma canción que la local.
 * Más vale no encontrar nada que poner una carátula o unos datos equivocados.
 */

const MIN_TITLE = 0.8;
const MIN_ARTIST = 0.6;
const MAX_DURATION_GAP = 20; // s: más diferencia suele ser otra versión (directo, remix…)
const STRICT_DURATION_GAP = 3; // s: sin artista, la duración tiene que coincidir

/** Minúsculas, sin tildes ni signos, sin "(Remastered)", "[Live]" ni "feat. …". */
export function simplify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s(feat|ft|featuring)\.?\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function bigrams(text) {
  const grams = new Map();
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Coeficiente de Dice sobre bigramas (0..1): tolera erratas y diferencias menores. */
export function similarity(a, b) {
  const [x, y] = [simplify(a), simplify(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const [gx, gy] = [bigrams(x), bigrams(y)];
  let overlap = 0;
  for (const [gram, count] of gx) overlap += Math.min(count, gy.get(gram) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

const ARTIST_SEPARATORS = /\s*(?:,|&|\+|\/|\bx\b|\by\b|\band\b|\bfeat\.?|\bft\.?|\bcon\b|\bwith\b)\s*/i;

/** Como similarity(), pero "Luis Fonsi" encaja con "Luis Fonsi & Daddy Yankee". */
export function artistSimilarity(local, remote) {
  const parts = (text) => String(text ?? '').split(ARTIST_SEPARATORS).filter(Boolean);
  let best = similarity(local, remote);
  for (const a of parts(local)) for (const b of parts(remote)) best = Math.max(best, similarity(a, b));
  return best;
}

/** "01. Luis Fonsi - Despacito" → { artist: 'Luis Fonsi', title: 'Despacito' }. */
export function parseFileName(fileName) {
  const text = String(fileName)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d{1,3}(?:\s*[-.)]\s*|\s+)(?=\S)/, '');
  const parts = text.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: text };
}

/** El título vino del nombre del archivo (no había etiquetas). */
export function isTitleFromFile(record) {
  return record.titleFromFile ?? record.title === path.basename(record.path, path.extname(record.path));
}

/** Qué buscar: las etiquetas si las hay; si no, lo que se deduzca del nombre del archivo. */
export function queryFromRecord(record) {
  const knownArtist = record.artist && record.artist !== UNKNOWN_ARTIST ? record.artist : '';
  if (!isTitleFromFile(record)) return { title: record.title, artist: knownArtist, album: record.album, duration: record.duration };
  const parsed = parseFileName(record.title);
  return { title: parsed.title, artist: knownArtist || parsed.artist, album: record.album, duration: record.duration };
}

export function scoreCandidate(query, candidate) {
  return {
    title: similarity(query.title, candidate.title),
    artist: query.artist ? artistSimilarity(query.artist, candidate.artist) : null,
    durationGap: query.duration > 0 && candidate.duration > 0 ? Math.abs(query.duration - candidate.duration) : null,
  };
}

export function isMatch({ title, artist, durationGap }) {
  if (title < MIN_TITLE) return false;
  if (durationGap !== null && durationGap > MAX_DURATION_GAP) return false;
  if (artist !== null) return artist >= MIN_ARTIST;
  // Sin artista, un título suelto ("Intro") encaja con miles de canciones: exigir también la duración.
  return title >= 0.95 && durationGap !== null && durationGap <= STRICT_DURATION_GAP;
}

function rank({ title, artist, durationGap }) {
  return title * 0.6 + (artist ?? 0) * 0.4 - (durationGap ?? MAX_DURATION_GAP) / 100;
}

/** El candidato que mejor encaja, o null si ninguno es fiable. */
export function pickBest(query, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(query, candidate);
    if (isMatch(score) && (!best || rank(score) > best.rank)) best = { candidate, rank: rank(score) };
  }
  return best?.candidate ?? null;
}
