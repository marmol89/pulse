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

/** Marcas de otra versión de la canción ("(Remix)", "[Live]", "- Acoustic"…). "Remastered" no cuenta. */
const VERSION_WORDS =
  /\b(remix|mix|live|en vivo|en directo|directo|version|acoustic|acustic[oa]|instrumental|karaoke|cover|edit|sped up|slowed|demo|a ?cappella|acapella|mandarin|english|spanish|portuguese|japanese|korean)\b/;
/** Recopilatorios y bandas sonoras: si hay alternativa, mejor el álbum original. */
const COMPILATION_WORDS =
  /\b(soundtrack|banda sonora|greatest hits|grandes exitos|best of|lo mejor|collection|coleccion|essentials|anthology|antologia|tribute|tributo|karaoke)\b/;

/** Minúsculas y sin tildes, sin quitar nada más. */
function plain(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Texto de los calificativos de un título: lo que va entre paréntesis, corchetes o tras " - ". */
function qualifiers(title) {
  return [...plain(title).matchAll(/\((.*?)\)|\[(.*?)\]|\s-\s(.*)$/g)].map((match) => match[1] ?? match[2] ?? match[3]).join(' ');
}

/** El candidato es otra versión (remix, directo, en otro idioma…) que la canción local no dice ser. */
export function isOtherVersion(localTitle, candidateTitle) {
  const marker = qualifiers(candidateTitle).match(VERSION_WORDS)?.[0];
  return Boolean(marker) && !plain(localTitle).includes(marker);
}

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

function artistParts(text) {
  return String(text ?? '')
    .split(ARTIST_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Como similarity(), pero "Luis Fonsi" encaja con "Luis Fonsi & Daddy Yankee". */
export function artistSimilarity(local, remote) {
  let best = similarity(local, remote);
  for (const a of artistParts(local)) for (const b of artistParts(remote)) best = Math.max(best, similarity(a, b));
  return best;
}

/** "Luis Fonsi & Daddy Yankee" → "Luis Fonsi". */
export function primaryArtist(artist) {
  return artistParts(artist)[0] ?? '';
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

/**
 * Qué buscar: las etiquetas si las hay; si no, lo que se deduzca del nombre del archivo.
 * Un nombre "A - B" puede ser "Artista - Título" o "Título - Artista" ("Tussi - Arcángel"): se prueban
 * las dos lecturas, en ese orden. Ambas tienen las mismas palabras, así que basta una búsqueda por servicio.
 */
export function queriesFromRecord(record) {
  const knownArtist = record.artist && record.artist !== UNKNOWN_ARTIST ? record.artist : '';
  const base = { album: record.album, duration: record.duration };
  if (!isTitleFromFile(record)) return [{ title: record.title, artist: knownArtist, ...base }];
  const parsed = parseFileName(record.title);
  const queries = [{ title: parsed.title, artist: knownArtist || parsed.artist, ...base }];
  if (parsed.artist && !knownArtist) queries.push({ title: parsed.artist, artist: parsed.title, ...base });
  return queries;
}

export function scoreCandidate(query, candidate) {
  return {
    title: similarity(query.title, candidate.title),
    artist: query.artist ? artistSimilarity(query.artist, candidate.artist) : null,
    album: query.album && candidate.album ? similarity(query.album, candidate.album) : null,
    durationGap: query.duration > 0 && candidate.duration > 0 ? Math.abs(query.duration - candidate.duration) : null,
    otherVersion: isOtherVersion(query.title, candidate.title),
    compilation: COMPILATION_WORDS.test(plain(candidate.album)),
  };
}

export function isMatch({ title, artist, durationGap, otherVersion }) {
  if (title < MIN_TITLE || otherVersion) return false;
  if (durationGap !== null && durationGap > MAX_DURATION_GAP) return false;
  if (artist !== null) return artist >= MIN_ARTIST;
  // Sin artista, un título suelto ("Intro") encaja con miles de canciones: exigir también la duración.
  return title >= 0.95 && durationGap !== null && durationGap <= STRICT_DURATION_GAP;
}

function rank({ title, artist, album, durationGap, compilation }) {
  return title * 0.6 + (artist ?? 0) * 0.4 + (album ?? 0) * 0.2 - (compilation ? 0.05 : 0) - (durationGap ?? MAX_DURATION_GAP) / 100;
}

/** El candidato que encaja con la primera lectura que encaje (ver queriesFromRecord), o null. */
export function pickBestOf(queries, candidates) {
  for (const query of queries) {
    const best = pickBest(query, candidates);
    if (best) return best;
  }
  return null;
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
