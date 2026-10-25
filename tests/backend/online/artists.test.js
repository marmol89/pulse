import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createArtistPictures, songsOf } from '../../../src/backend/online/artists.js';
import { findArtistPicture } from '../../../src/backend/online/deezer.js';
import { createHttp } from '../../../src/backend/online/http.js';
import { memoryFiles } from '../../helpers/memoryFiles.js';
import { fakeFetch, imageResponse, jsonResponse } from '../../helpers/fakeFetch.js';

const ARTISTS = 'https://api.deezer.com/search/artist';
const PICTURES = 'https://cdn-images.dzcdn.net/';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9]);
const picture = (id) => `${PICTURES}images/artist/${id}/1000x1000-000000-80-0-0.jpg`;
const artist = (name, id, fans = 0) => ({ id: 1, name, type: 'artist', nb_fan: fans, picture_xl: picture(id) });
const TRACKS = 'https://api.deezer.com/search?';
const song = (title, artistName, id) => ({ type: 'track', title, duration: 200, artist: { name: artistName, picture_xl: picture(id) }, album: { title: 'Disco' } });

/** Deezer falso: cada nombre buscado devuelve los artistas de `byName`. */
function setup(byName = {}, { files = memoryFiles(), extra = {} } = {}) {
  const fetch = fakeFetch({
    ...extra,
    [ARTISTS]: (url) => ({ data: byName[new URL(url).searchParams.get('q')] ?? [] }),
    [PICTURES]: () => imageResponse(JPEG),
  });
  const http = createHttp(fetch, { userAgent: 'Pulse/test' });
  const updates = [];
  const pictures = createArtistPictures({ files, http, onUpdated: (found) => updates.push(found), interval: 0, retryDelay: 0, now: () => 1000 });
  return { fetch, http, files, pictures, updates, searches: () => fetch.requests.filter((request) => request.url.startsWith(ARTISTS)).length };
}

async function until(condition) {
  for (let i = 0; i < 200 && !condition(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), 'no llegó a cumplirse');
}

describe('online/deezer · fotos de artista', () => {
  // Caso real: buscando "Rosalía", Deezer da antes cinco homónimos con decenas de fans que a ROSALÍA (un millón).
  test('por nombre, solo el homónimo mucho más conocido que los demás y con foto de verdad', async () => {
    const { http } = setup({
      'Rosalía': [artist('Rosalia', 'r1', 26), artist('Rosalía', 'd41d8cd98f00b204e9800998ecf8427e', 263), artist('ROSALÍA', 'abc', 1_066_792), artist('Rosalia Fans', 'f', 5_000_000)],
      Kora: [artist('Kora', 'k1', 317), artist('Kora', 'k2', 78)], // no se sabe cuál es
      Solo: [artist('Solo', '')], // la silueta gris: /images/artist//
      Nadie: [artist('Otro grupo', 'x')],
    });
    assert.equal(await findArtistPicture(http, 'Rosalía'), picture('abc'));
    assert.equal(await findArtistPicture(http, 'Kora'), null);
    assert.equal(await findArtistPicture(http, 'Solo'), null);
    assert.equal(await findArtistPicture(http, 'Nadie'), null);
    assert.equal(await findArtistPicture(http, '  '), null);
  });

  test('con una de sus canciones, la foto del artista de esa canción', async () => {
    const { http, fetch } = setup(
      { Kora: [artist('Kora', 'k1', 317), artist('Kora', 'k2', 78)] },
      { extra: { [TRACKS]: { data: [song('Selva', 'Kora Tribute', 'no'), song('Selva', 'Kora', 'k2')] } } },
    );
    assert.equal(await findArtistPicture(http, 'Kora', [{ title: 'Selva', duration: 199 }]), picture('k2'));
    assert.equal(fetch.requests.filter((request) => request.url.startsWith(ARTISTS)).length, 0, 'no hace falta buscar por nombre');
  });
});

describe('online/artists', () => {
  test('songsOf() da hasta dos canciones con título de verdad en las que sale el artista', () => {
    const records = [
      { title: 'a', artist: 'Kora', duration: 10 },
      { title: 'archivo', artist: 'Kora', titleFromFile: true },
      { title: 'b', artist: 'Farruko, Kora' },
      { title: 'c', artist: 'KORA' },
      { title: 'd', artist: 'Otro' },
    ];
    assert.deepEqual(songsOf(records, 'Kora'), [
      { title: 'a', duration: 10 },
      { title: 'b', duration: 0 },
    ]);
  });

  test('busca en segundo plano solo con "Datos de internet" y guarda la foto como una carátula', async () => {
    const { pictures, updates, files, searches } = setup({ 'Aurora Vega': [artist('Aurora Vega', 'a1')], Kora: [] });

    assert.deepEqual(pictures.request(['Aurora Vega', 'Kora', 'Aurora Vega', 'Artista desconocido', '']), {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(searches(), 0, 'desactivado no sale a internet');

    pictures.setEnabled(true);
    await until(() => updates.length === 1);
    const [[name, coverName]] = Object.entries(updates[0]);
    assert.equal(name, 'Aurora Vega');
    assert.deepEqual(await files.read(`covers/${coverName}`), JPEG);
    assert.deepEqual(await pictures.read(coverName), JPEG);
    assert.equal(await pictures.read('otra.jpg'), null, 'solo sirve fotos de artista');
    assert.equal(searches(), 2);

    assert.deepEqual(pictures.request(['Aurora Vega', 'Kora']), { 'Aurora Vega': coverName }, 'sin foto en Deezer: no se repite');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(searches(), 2);
  });

  test('lo buscado se recuerda en artists.json para la próxima vez', async () => {
    const first = setup({ Kora: [artist('Kora', 'k1')] });
    first.pictures.setEnabled(true);
    first.pictures.request(['Kora']);
    await until(() => first.updates.length === 1);

    const again = setup({}, { files: first.files });
    await again.pictures.load();
    assert.deepEqual(again.pictures.request(['Kora']), first.updates[0]);
    assert.equal(again.searches(), 0);
  });

  test('si Deezer está ocupado, el artista sigue pendiente y se reintenta', async () => {
    let busy = true;
    const files = memoryFiles();
    const fetch = fakeFetch({
      [ARTISTS]: () => (busy ? jsonResponse({ error: { code: 4, message: 'Quota limit exceeded' } }) : { data: [artist('Kora', 'k1')] }),
      [PICTURES]: () => imageResponse(JPEG),
    });
    const updates = [];
    const pictures = createArtistPictures({ files, http: createHttp(fetch, { userAgent: 'Pulse/test' }), onUpdated: (found) => updates.push(found), interval: 0, retryDelay: 10 });
    pictures.setEnabled(true);
    pictures.request(['Kora']);
    await until(() => fetch.requests.length >= 1);
    busy = false;
    await until(() => updates.length === 1);
    assert.deepEqual(Object.keys(updates[0]), ['Kora']);
  });
});
