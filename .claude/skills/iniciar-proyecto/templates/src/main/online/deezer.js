import { TransientError } from './http.js';

/**
 * Deezer (gratuita, sin clave): segunda fuente de datos y carátula cuando iTunes no tiene la canción.
 * Su búsqueda no da género, año ni número de pista; sí título, artista, álbum, duración y carátula.
 */
const ENDPOINT = 'https://api.deezer.com/search';
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
