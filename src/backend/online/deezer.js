import { TransientError } from './http.js';
import { simplify } from './matching.js';

/**
 * Deezer (gratuita, sin clave): segunda fuente de datos y carátula cuando iTunes no tiene la canción.
 * Su búsqueda no da género, año ni número de pista; sí título, artista, álbum, duración y carátula.
 */
const ENDPOINT = 'https://api.deezer.com/search';
const ARTIST_ENDPOINT = 'https://api.deezer.com/search/artist';
// Deezer da una silueta gris a los artistas sin foto: su URL no lleva identificador ("/images/artist//").
const NO_PICTURE = '/images/artist//';
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
 * Foto del artista (1000×1000) o null: solo si Deezer tiene un artista con ese mismo nombre
 * (sin tildes ni mayúsculas) y una foto de verdad. Mejor sin foto que con la de otro.
 */
export async function findArtistPicture(http, name) {
  const wanted = simplify(name);
  if (!wanted) return null;
  const data = await http.json(`${ARTIST_ENDPOINT}?${new URLSearchParams({ q: name, limit: '5' })}`);
  if (data?.error?.code === QUOTA_EXCEEDED) throw new TransientError('api.deezer.com: límite de peticiones');
  const artist = (data?.data ?? []).find((result) => simplify(result.name) === wanted);
  const picture = artist?.picture_xl ?? artist?.picture_big ?? null;
  return picture && !picture.includes(NO_PICTURE) ? picture : null;
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
    url: result.link ?? null,
  };
}
