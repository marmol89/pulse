import { pickBest, primaryArtist } from './matching.js';

/** LRCLIB (gratuita, sin clave): letras de canciones. */
const ENDPOINT = 'https://lrclib.net/api/search';

/**
 * Letra de la canción, o null si no hay una fiable: `lyrics` en texto plano y `syncedLyrics` en formato LRC
 * ("[01:02.34] verso", vacío si LRCLIB no la tiene sincronizada).
 */
export async function findLyrics(http, { title, artist, duration }) {
  if (!title || !artist) return null;
  // Con el artista principal LRCLIB devuelve las entradas buenas; con "A & B", otras peor transcritas.
  const params = new URLSearchParams({ track_name: title, artist_name: primaryArtist(artist) });
  const results = (await http.json(`${ENDPOINT}?${params}`)) ?? [];
  const candidates = results
    .filter((result) => !result.instrumental && result.plainLyrics?.trim())
    .map((result) => ({
      title: result.trackName,
      artist: result.artistName,
      duration: result.duration,
      lyrics: cleanLyrics(result.plainLyrics),
      syncedLyrics: result.syncedLyrics?.trim() ?? '',
    }));
  const best = pickBest({ title, artist, duration }, candidates);
  return best ? { lyrics: best.lyrics, syncedLyrics: best.syncedLyrics } : null;
}

/** Algunas entradas de LRCLIB usan "^" como salto de línea. */
function cleanLyrics(text) {
  return text.replace(/[ \t]*\^[ \t]*/g, '\n').trim();
}
