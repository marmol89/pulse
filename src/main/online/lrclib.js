import { pickBest } from './matching.js';

/** LRCLIB (gratuita, sin clave): letras de canciones. */
const ENDPOINT = 'https://lrclib.net/api/search';

/** Letra (texto plano) de la canción, o null si no hay una fiable. */
export async function findLyrics(http, { title, artist, duration }) {
  if (!title || !artist) return null;
  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  const results = (await http.json(`${ENDPOINT}?${params}`)) ?? [];
  const candidates = results
    .filter((result) => !result.instrumental && result.plainLyrics?.trim())
    .map((result) => ({ title: result.trackName, artist: result.artistName, duration: result.duration, lyrics: result.plainLyrics.trim() }));
  return pickBest({ title, artist, duration }, candidates)?.lyrics ?? null;
}
