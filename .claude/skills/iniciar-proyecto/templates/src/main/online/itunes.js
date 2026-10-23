/**
 * iTunes Search API (gratuita, sin clave): carátula, álbum, año, género, número de pista.
 * Límite orientativo de Apple: unas 20 búsquedas por minuto.
 */
const ENDPOINT = 'https://itunes.apple.com/search';
const ARTWORK_SIZE = 600;

export function itunesSearchUrl({ title, artist }) {
  const params = new URLSearchParams({
    term: [artist, title].filter(Boolean).join(' '),
    media: 'music',
    entity: 'song',
    limit: '10',
    country: 'ES', // catálogo y géneros en español ("Pop en español")
    lang: 'es_es',
  });
  return `${ENDPOINT}?${params}`;
}

/** @returns {Promise<object[]>} candidatos con el mismo formato que usa matching.js */
export async function searchItunes(http, query) {
  if (!query.title) return [];
  const data = await http.json(itunesSearchUrl(query));
  return (data?.results ?? []).filter((result) => result.kind === 'song').map(toCandidate);
}

function toCandidate(result) {
  return {
    source: 'iTunes',
    title: result.trackName ?? '',
    artist: result.artistName ?? '',
    album: result.collectionName ?? '',
    albumArtist: result.collectionArtistName ?? result.artistName ?? '',
    genre: result.primaryGenreName ?? '',
    year: result.releaseDate ? new Date(result.releaseDate).getUTCFullYear() : 0,
    trackNo: result.trackNumber ?? 0,
    trackCount: result.trackCount ?? 0,
    disc: result.discNumber ?? 0,
    duration: result.trackTimeMillis ? result.trackTimeMillis / 1000 : 0,
    artworkUrl: largeArtwork(result.artworkUrl100),
    url: result.trackViewUrl ?? null,
  };
}

/** ".../100x100bb.jpg" → ".../600x600bb.jpg" */
function largeArtwork(url) {
  return url ? url.replace(/\/\d+x\d+bb\.(?:jpg|png)$/, `/${ARTWORK_SIZE}x${ARTWORK_SIZE}bb.jpg`) : null;
}
