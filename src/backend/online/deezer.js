import { TransientError } from './http.js';
import { pickBest, simplify } from './matching.js';

/**
 * Deezer (gratuita, sin clave): segunda fuente de datos y carátula cuando iTunes no tiene la canción.
 * Su búsqueda no da género, año ni número de pista; sí título, artista, álbum, duración y carátula.
 */
const ENDPOINT = 'https://api.deezer.com/search';
const ARTIST_ENDPOINT = 'https://api.deezer.com/search/artist';
// Deezer da una silueta gris a los artistas sin foto: su URL va sin identificador ("/images/artist//")
// o con el MD5 de un texto vacío.
const NO_PICTURES = ['/images/artist//', '/d41d8cd98f00b204e9800998ecf8427e/'];
const NAMESAKE_RATIO = 10; // por nombre, solo si un homónimo tiene 10 veces más fans que el siguiente
const QUOTA_EXCEEDED = 4; // código de error de Deezer: demasiadas peticiones

export function deezerSearchUrl({ title, artist }) {
  const params = new URLSearchParams({ q: [artist, title].filter(Boolean).join(' '), limit: '10' });
  return `${ENDPOINT}?${params}`;
}

/** @returns {Promise<object[]>} candidatos con el mismo formato que usa matching.js */
export async function searchDeezer(http, query) {
  if (!query.title) return [];
  const data = await http.json(deezerSearchUrl(query));
  // Deezer responde 200 con { error } también al pasarse del límite: eso es "prueba más tarde".
  if (data?.error?.code === QUOTA_EXCEEDED) throw new TransientError('api.deezer.com: límite de peticiones');
  return (data?.data ?? []).filter((result) => result.type === 'track' || !result.type).map(toCandidate);
}

/**
 * Foto del artista (1000×1000) o null. Hay muchos homónimos y la búsqueda de artistas de Deezer los ordena mal:
 * primero se busca una de sus canciones (`songs`: [{ title, duration }]) y se toma el artista de esa canción;
 * si no, por nombre, solo cuando uno de los que se llaman igual es mucho más conocido que el resto.
 * Mejor sin foto que con la de otro.
 */
export async function findArtistPicture(http, name, songs = []) {
  const wanted = simplify(name);
  if (!wanted) return null;
  for (const { title, duration = 0 } of songs.slice(0, 2)) {
    const candidates = (await searchDeezer(http, { title, artist: name })).filter((candidate) => simplify(candidate.artist) === wanted);
    const song = pickBest({ title, artist: name, duration }, candidates);
    if (song) return song.artistPicture;
  }
  const data = await http.json(`${ARTIST_ENDPOINT}?${new URLSearchParams({ q: name, limit: '25' })}`);
  if (data?.error?.code === QUOTA_EXCEEDED) throw new TransientError('api.deezer.com: límite de peticiones');
  const [first, second] = (data?.data ?? []).filter((result) => simplify(result.name) === wanted).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
  if (!first || (second && (first.nb_fan ?? 0) < NAMESAKE_RATIO * (second.nb_fan ?? 0))) return null;
  return realPicture(first.picture_xl ?? first.picture_big);
}

function realPicture(url) {
  return typeof url === 'string' && !NO_PICTURES.some((marker) => url.includes(marker)) ? url : null;
}

function toCandidate(result) {
  return {
    source: 'Deezer',
    title: result.title ?? '',
    artist: result.artist?.name ?? '',
    album: result.album?.title ?? '',
    albumArtist: result.artist?.name ?? '',
    genre: '',
    year: 0,
    trackNo: 0,
    trackCount: 0,
    disc: 0,
    duration: result.duration ?? 0,
    artworkUrl: result.album?.cover_xl ?? result.album?.cover_big ?? null,
    artistPicture: realPicture(result.artist?.picture_xl ?? result.artist?.picture_big),
    url: result.link ?? null,
  };
}
