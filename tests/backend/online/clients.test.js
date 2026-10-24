import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, TransientError } from '../../../src/backend/online/http.js';
import { searchItunes, itunesSearchUrl } from '../../../src/backend/online/itunes.js';
import { findLyrics } from '../../../src/backend/online/lrclib.js';
import { searchDeezer, deezerSearchUrl } from '../../../src/backend/online/deezer.js';
import { fakeFetch, jsonResponse, imageResponse, itunesResult, lrclibResult, deezerResult } from '../../helpers/fakeFetch.js';

const USER_AGENT = 'Pulse/test';
const httpWith = (routes) => {
  const fetch = fakeFetch(routes);
  return { fetch, http: createHttp(fetch, { userAgent: USER_AGENT, timeout: 200 }) };
};

describe('online/http', () => {
  test('envía el User-Agent y devuelve null en un 404', async () => {
    const { fetch, http } = httpWith({ 'https://api.test/existe': { ok: true } });
    assert.deepEqual(await http.json('https://api.test/existe'), { ok: true });
    assert.equal(await http.json('https://api.test/falta'), null);
    assert.equal(fetch.requests[0].headers['User-Agent'], USER_AGENT);
  });

  test('sin red, 403, 429 o 5xx son fallos pasajeros (TransientError)', async () => {
    const { http } = httpWith({
      'https://api.test/red': new TypeError('fetch failed'),
      'https://api.test/limite': () => jsonResponse({}, 403),
      'https://api.test/ocupado': () => jsonResponse({ name: 'ServerOverloaded' }, 503),
    });
    for (const url of ['https://api.test/red', 'https://api.test/limite', 'https://api.test/ocupado']) {
      await assert.rejects(http.json(url), TransientError);
    }
  });

  test('una petición que no responde agota el tiempo como fallo pasajero', async () => {
    const { http } = httpWith({ 'https://api.test/lento': () => new Promise(() => {}) });
    await assert.rejects(http.json('https://api.test/lento'), TransientError);
  });

  test('image() solo acepta imágenes dentro del tamaño máximo', async () => {
    const { http } = httpWith({
      'https://img.test/ok': () => imageResponse(),
      'https://img.test/html': () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    });
    assert.deepEqual(await http.image('https://img.test/ok', 1000), { type: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
    assert.equal(await http.image('https://img.test/ok', 2), null);
    assert.equal(await http.image('https://img.test/html', 1000), null);
  });
});

describe('online/itunes', () => {
  test('busca canciones en el catálogo español por artista y título', () => {
    const url = new URL(itunesSearchUrl({ title: 'Despacito', artist: 'Luis Fonsi' }));
    assert.equal(url.searchParams.get('term'), 'Luis Fonsi Despacito');
    assert.equal(url.searchParams.get('entity'), 'song');
    assert.equal(url.searchParams.get('country'), 'ES');
    assert.equal(url.searchParams.get('lang'), 'es_es');
  });

  test('convierte los resultados en candidatos con carátula de 600×600', async () => {
    const { http } = httpWith({ 'https://itunes.apple.com/search': { resultCount: 2, results: [itunesResult(), { kind: 'music-video' }] } });

    const [candidate, ...rest] = await searchItunes(http, { title: 'Despacito', artist: 'Luis Fonsi' });

    assert.equal(rest.length, 0);
    assert.deepEqual(candidate, {
      source: 'iTunes',
      title: 'Despacito',
      artist: 'Luis Fonsi & Daddy Yankee',
      album: 'VIDA',
      albumArtist: 'Luis Fonsi',
      genre: 'Pop en español',
      year: 2017,
      trackNo: 9,
      trackCount: 15,
      disc: 1,
      duration: 229.387,
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/e2/ef/f0/18UMGIM85289.rgb.jpg/600x600bb.jpg',
      url: 'https://music.apple.com/es/album/despacito/1447401519?i=1447401620',
    });
  });

  test('sin título no busca y un 503 se propaga como fallo pasajero', async () => {
    const { fetch, http } = httpWith({ 'https://itunes.apple.com/search': () => jsonResponse({}, 503) });
    assert.deepEqual(await searchItunes(http, { title: '' }), []);
    assert.equal(fetch.requests.length, 0);
    await assert.rejects(searchItunes(http, { title: 'Despacito' }), TransientError);
  });
});

describe('online/deezer', () => {
  test('busca por artista y título', () => {
    assert.equal(new URL(deezerSearchUrl({ title: 'Tussi', artist: 'Arcángel' })).searchParams.get('q'), 'Arcángel Tussi');
  });

  test('convierte los resultados en candidatos con la carátula grande', async () => {
    const { http } = httpWith({ 'https://api.deezer.com/search': { data: [deezerResult(), { type: 'album' }], total: 2 } });
    const [candidate, ...rest] = await searchDeezer(http, { title: 'Tussi', artist: 'Arcángel' });
    assert.equal(rest.length, 0);
    assert.deepEqual(candidate, {
      source: 'Deezer',
      title: 'Tussi',
      artist: 'Arcangel',
      album: 'Tussi',
      albumArtist: 'Arcangel',
      genre: '',
      year: 0,
      trackNo: 0,
      trackCount: 0,
      disc: 0,
      duration: 189,
      artworkUrl: deezerResult().album.cover_xl,
      url: 'https://www.deezer.com/track/1080687652',
    });
  });

  test('sin título no busca y el límite de peticiones es un fallo pasajero', async () => {
    const { fetch, http } = httpWith({ 'https://api.deezer.com/search': { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } } });
    assert.deepEqual(await searchDeezer(http, { title: '' }), []);
    assert.equal(fetch.requests.length, 0);
    await assert.rejects(searchDeezer(http, { title: 'Tussi' }), TransientError);
  });
});

describe('online/lrclib', () => {
  test('elige la letra cuya duración y nombres encajan', async () => {
    const { fetch, http } = httpWith({
      'https://lrclib.net/api/search': [
        lrclibResult({ albumName: 'Despacito', duration: 273, plainLyrics: 'versión larga' }),
        lrclibResult({ duration: 229, plainLyrics: 'la buena' }),
        lrclibResult({ duration: 229, instrumental: true, plainLyrics: null }),
      ],
    });

    assert.equal(await findLyrics(http, { title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }), 'la buena');
    const url = new URL(fetch.requests[0].url);
    assert.equal(url.searchParams.get('track_name'), 'Despacito');
    assert.equal(url.searchParams.get('artist_name'), 'Luis Fonsi');
  });

  // Caso real: con "Luis Fonsi & Daddy Yankee" LRCLIB devolvía entradas con "^" en vez de saltos de línea.
  test('busca con el artista principal y convierte "^" en saltos de línea', async () => {
    const { fetch, http } = httpWith({
      'https://lrclib.net/api/search': [lrclibResult({ artistName: 'Luis Fonsi, Daddy Yankee', plainLyrics: 'Ay (Fonsi, DY)^Ay (Fonsi, DY) \n(Oh, oh) ^ oh, no' })],
    });

    const lyrics = await findLyrics(http, { title: 'Despacito', artist: 'Luis Fonsi & Daddy Yankee', duration: 229 });

    assert.equal(new URL(fetch.requests[0].url).searchParams.get('artist_name'), 'Luis Fonsi');
    assert.equal(lyrics, 'Ay (Fonsi, DY)\nAy (Fonsi, DY) \n(Oh, oh)\noh, no');
  });

  test('sin artista no busca y sin coincidencias devuelve null', async () => {
    const { fetch, http } = httpWith({ 'https://lrclib.net/api/search': [lrclibResult({ artistName: 'Otro grupo' })] });
    assert.equal(await findLyrics(http, { title: 'Despacito', artist: '' }), null);
    assert.equal(fetch.requests.length, 0);
    assert.equal(await findLyrics(http, { title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }), null);
  });
});
