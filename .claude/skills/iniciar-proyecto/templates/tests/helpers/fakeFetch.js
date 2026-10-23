/**
 * fetch falso para los clientes de internet. `routes` asocia un prefijo de URL a:
 * un objeto (se responde como JSON), una función (url → Response u objeto) o un Error (se lanza).
 * Registra las peticiones en `fetch.requests`.
 */
export function fakeFetch(routes = {}) {
  const requests = [];
  async function fetch(url, init = {}) {
    requests.push({ url: String(url), headers: init.headers ?? {} });
    const prefix = Object.keys(routes).find((candidate) => String(url).startsWith(candidate));
    if (!prefix) return new Response('No encontrado', { status: 404 });
    const route = routes[prefix];
    const value = typeof route === 'function' ? await route(String(url)) : route;
    if (value instanceof Error) throw value;
    return value instanceof Response ? value : jsonResponse(value);
  }
  return Object.assign(fetch, { requests });
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function imageResponse(bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), type = 'image/jpeg') {
  return new Response(bytes, { headers: { 'Content-Type': type } });
}

/** Resultado de iTunes con la forma real de la API (respuesta de "Luis Fonsi Despacito"). */
export function itunesResult(fields = {}) {
  return {
    wrapperType: 'track',
    kind: 'song',
    trackName: 'Despacito',
    artistName: 'Luis Fonsi & Daddy Yankee',
    collectionName: 'VIDA',
    collectionArtistName: 'Luis Fonsi',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/e2/ef/f0/18UMGIM85289.rgb.jpg/100x100bb.jpg',
    primaryGenreName: 'Pop en español',
    releaseDate: '2017-01-12T08:00:00Z',
    trackNumber: 9,
    trackCount: 15,
    discNumber: 1,
    trackTimeMillis: 229387,
    trackViewUrl: 'https://music.apple.com/es/album/despacito/1447401519?i=1447401620',
    ...fields,
  };
}

/** Resultado de LRCLIB con la forma real de /api/search. */
export function lrclibResult(fields = {}) {
  return {
    id: 1017357,
    trackName: 'Despacito',
    artistName: 'Luis Fonsi',
    albumName: 'VIDA',
    duration: 229,
    instrumental: false,
    plainLyrics: 'Ay, ¡Fonsi! ¡D.Y.!\nOhhh, oh, no, oh, no, oh',
    syncedLyrics: '[00:01.00] Ay, ¡Fonsi!',
    ...fields,
  };
}
