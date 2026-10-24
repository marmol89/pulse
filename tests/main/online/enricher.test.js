import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEnricher, needsInfo } from '../../../src/main/online/enricher.js';
import { createHttp, TransientError } from '../../../src/main/online/http.js';
import { fakeFetch, jsonResponse, imageResponse, itunesResult, lrclibResult, deezerResult } from '../../helpers/fakeFetch.js';

const ITUNES = 'https://itunes.apple.com/search';
const LRCLIB = 'https://lrclib.net/api/search';
const DEEZER = 'https://api.deezer.com/search';
const ARTWORK = 'https://is1-ssl.mzstatic.com/';
const DEEZER_COVER = 'https://cdn-images.dzcdn.net/';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

let coversDir;
before(async () => {
  coversDir = await mkdtemp(path.join(tmpdir(), 'pulse-covers-'));
});
after(() => rm(coversDir, { recursive: true, force: true }));

function setup(routes = {}, covers = coversDir) {
  const fetch = fakeFetch({
    [ITUNES]: { resultCount: 1, results: [itunesResult()] },
    [ARTWORK]: () => imageResponse(JPEG),
    [LRCLIB]: [lrclibResult()],
    ...routes,
  });
  const enricher = createEnricher({ http: createHttp(fetch, { userAgent: 'Pulse/test' }), coversDir: covers, now: () => 1000 });
  return { fetch, enricher, calls: (prefix) => fetch.requests.filter((request) => request.url.startsWith(prefix)).length };
}

function record(fields = {}) {
  return {
    path: '/musica/despacito.mp3',
    title: 'Despacito',
    titleFromFile: false,
    artist: 'Luis Fonsi',
    albumArtist: '',
    album: '',
    genre: '',
    trackNo: 0,
    trackCount: 0,
    disc: 0,
    year: 0,
    duration: 229,
    lyrics: '',
    hasCover: false,
    ...fields,
  };
}

const complete = record({ album: 'VIDA', genre: 'Pop', year: 2017, hasCover: true });

describe('online/enricher', () => {
  test('needsInfo(): pistas sin carátula o sin datos que aún no se han buscado', () => {
    assert.equal(needsInfo(record()), true);
    assert.equal(needsInfo(complete), false);
    assert.equal(needsInfo({ ...complete, titleFromFile: true }), true);
    assert.equal(needsInfo(record({ online: { checkedAt: 5 } })), false);
  });

  test('needsInfo(): lo no encontrado con la búsqueda anterior (sin Deezer) se busca otra vez, una sola', () => {
    assert.equal(needsInfo(record({ online: { checkedAt: 5, status: 'not-found' } })), true);
    assert.equal(needsInfo(record({ online: { checkedAt: 5, status: 'not-found', version: 2 } })), false);
    assert.equal(needsInfo(record({ online: { checkedAt: 5, status: 'found' } })), false);
  });

  test('rellena álbum, año, género, pista y carátula sin pisar las etiquetas', async () => {
    const { enricher } = setup();

    const { record: updated, changed } = await enricher.enrich(record());

    assert.equal(changed, true);
    assert.deepEqual(
      { title: updated.title, artist: updated.artist, album: updated.album, albumArtist: updated.albumArtist, genre: updated.genre, year: updated.year, trackNo: updated.trackNo, trackCount: updated.trackCount },
      { title: 'Despacito', artist: 'Luis Fonsi', album: 'VIDA', albumArtist: 'Luis Fonsi', genre: 'Pop en español', year: 2017, trackNo: 9, trackCount: 15 },
    );
    assert.deepEqual(new Uint8Array(await readFile(updated.coverFile)), JPEG);
    assert.equal(path.dirname(updated.coverFile), coversDir);
    assert.deepEqual(updated.online, { checkedAt: 1000, version: 2, status: 'found', source: 'iTunes', url: itunesResult().trackViewUrl });
    assert.equal(needsInfo(updated), false);
  });

  test('sin etiquetas toma título y artista de internet a partir del nombre del archivo', async () => {
    const { enricher, fetch } = setup();
    const untagged = record({ path: '/m/01. Luis Fonsi - Despacito.mp3', title: '01. Luis Fonsi - Despacito', titleFromFile: true, artist: 'Artista desconocido' });

    const { record: updated } = await enricher.enrich(untagged);

    assert.equal(new URL(fetch.requests[0].url).searchParams.get('term'), 'Luis Fonsi Despacito');
    assert.equal(updated.title, 'Despacito');
    assert.equal(updated.artist, 'Luis Fonsi & Daddy Yankee');
    assert.equal(updated.titleFromFile, false);
  });

  test('si iTunes no la tiene, usa Deezer; acepta nombres "Título - Artista" y busca la letra con lo encontrado', async () => {
    const { enricher, calls, fetch } = setup({
      [ITUNES]: { results: [itunesResult({ trackName: 'Tussi', artistName: 'Maik G', trackTimeMillis: 159000 })] },
      [DEEZER]: { data: [deezerResult()] },
      [DEEZER_COVER]: () => imageResponse(JPEG),
      [LRCLIB]: [lrclibResult({ trackName: 'Tussi', artistName: 'Arcángel', duration: 192.59, plainLyrics: 'Letra de Tussi' })],
    });
    const untagged = record({ path: '/m/Tussi - Arcángel.mp3', title: 'Tussi - Arcángel', titleFromFile: true, artist: 'Artista desconocido', duration: 192.65 });

    const { record: updated } = await enricher.enrich(untagged, { lyrics: true });

    assert.equal(calls(ITUNES), 1);
    assert.equal(calls(DEEZER), 1, 'una sola búsqueda en Deezer para las dos lecturas');
    assert.deepEqual([updated.title, updated.artist, updated.album, updated.online.source], ['Tussi', 'Arcangel', 'Tussi', 'Deezer']);
    assert.deepEqual(new Uint8Array(await readFile(updated.coverFile)), JPEG);
    assert.equal(updated.lyrics, 'Letra de Tussi');
    const lyricsQuery = new URL(fetch.requests.find((request) => request.url.startsWith(LRCLIB)).url).searchParams;
    assert.deepEqual([lyricsQuery.get('track_name'), lyricsQuery.get('artist_name')], ['Tussi', 'Arcangel']);
  });

  test('sin datos en ningún servicio, la letra se busca con las lecturas del nombre del archivo', async () => {
    const { enricher, fetch } = setup({
      [ITUNES]: { results: [] },
      [LRCLIB]: (url) => (new URL(url).searchParams.get('track_name') === 'Tussi' ? [lrclibResult({ trackName: 'Tussi', artistName: 'Arcángel', duration: 192.59, plainLyrics: 'Letra de Tussi' })] : []),
    });
    const untagged = record({ path: '/m/Tussi - Arcángel.mp3', title: 'Tussi - Arcángel', titleFromFile: true, artist: 'Artista desconocido', duration: 192.65 });

    const { record: updated } = await enricher.enrich(untagged, { lyrics: true });

    assert.equal(updated.online.status, 'not-found');
    assert.equal(updated.lyrics, 'Letra de Tussi');
    assert.deepEqual(
      fetch.requests.filter((request) => request.url.startsWith(LRCLIB)).map((request) => new URL(request.url).searchParams.get('track_name')),
      ['Arcángel', 'Tussi'],
    );
  });

  test('una letra no encontrada con la búsqueda anterior se busca otra vez', async () => {
    const { enricher, calls } = setup({ [LRCLIB]: [] });
    const old = { ...complete, online: { checkedAt: 5, status: 'found', lyricsCheckedAt: 5 } };
    const { record: updated } = await enricher.enrich(old, { lyrics: true });
    const again = await enricher.enrich(updated, { lyrics: true });
    assert.equal(updated.online.lyricsVersion, 2);
    assert.equal(again.changed, false);
    assert.equal(calls(LRCLIB), 1);
  });

  test('si el archivo ya tiene carátula no descarga otra', async () => {
    const { enricher, calls } = setup();
    const { record: updated } = await enricher.enrich(record({ hasCover: true }));
    assert.equal(calls(ARTWORK), 0);
    assert.equal(updated.coverFile, null);
  });

  test('las pistas de un mismo álbum comparten la carátula descargada', async () => {
    const { enricher, calls } = setup({}, path.join(coversDir, 'album'));
    const first = await enricher.enrich(record({ path: '/m/a.mp3' }));
    const second = await enricher.enrich(record({ path: '/m/b.mp3' }));
    assert.equal(first.record.coverFile, second.record.coverFile);
    assert.equal(calls(ARTWORK), 1);
  });

  test('sin coincidencia fiable la marca como no encontrada y no la vuelve a buscar', async () => {
    const { enricher, calls } = setup({ [ITUNES]: { results: [itunesResult({ artistName: 'Kidz Bop Kids', collectionArtistName: 'Kidz Bop Kids' })] } });

    const { record: updated } = await enricher.enrich(record());
    const again = await enricher.enrich(updated);

    assert.deepEqual(updated.online, { checkedAt: 1000, version: 2, status: 'not-found', source: null });
    assert.equal(updated.album, '');
    assert.equal(again.changed, false);
    assert.equal(calls(ITUNES), 1);
  });

  test('con lyrics: true busca la letra una sola vez (también si no la encuentra)', async () => {
    const { enricher, calls } = setup({ [LRCLIB]: [] });

    const { record: updated } = await enricher.enrich(complete, { lyrics: true });
    const again = await enricher.enrich(updated, { lyrics: true });

    assert.equal(updated.lyrics, '');
    assert.equal(updated.online.lyricsCheckedAt, 1000);
    assert.equal(again.changed, false);
    assert.equal(calls(LRCLIB), 1);
    assert.equal(calls(ITUNES), 0, 'la pista ya estaba completa');
  });

  test('guarda la letra encontrada y su fuente', async () => {
    const { enricher } = setup();
    const { record: updated } = await enricher.enrich(complete, { lyrics: true });
    assert.equal(updated.lyrics, lrclibResult().plainLyrics);
    assert.equal(updated.online.lyricsSource, 'LRCLIB');
  });

  test('force vuelve a buscar datos y letra aunque ya se hubieran buscado', async () => {
    const { enricher, calls } = setup();
    const checked = record({ online: { checkedAt: 5, status: 'not-found', lyricsCheckedAt: 5 } });
    const { record: updated } = await enricher.enrich(checked, { force: true, lyrics: true });
    assert.equal(updated.online.status, 'found');
    assert.equal(calls(ITUNES), 1);
    assert.equal(calls(LRCLIB), 1);
  });

  test('una pista completa sin pedir letra no hace ninguna petición', async () => {
    const { enricher, fetch } = setup();
    assert.deepEqual(await enricher.enrich(complete), { record: complete, changed: false });
    assert.equal(fetch.requests.length, 0);
  });

  test('un fallo pasajero se propaga y una respuesta rota cuenta como no encontrada', async () => {
    const busy = setup({ [ITUNES]: () => jsonResponse({}, 503) });
    await assert.rejects(busy.enricher.enrich(record()), TransientError);

    const broken = setup({ [ITUNES]: () => new Response('{no es json', { status: 200 }) });
    const { record: updated } = await broken.enricher.enrich(record());
    assert.equal(updated.online.status, 'not-found');
  });
});
