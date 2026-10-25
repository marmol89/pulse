import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import artistPictures from '../../src/renderer/mediator/handlers/artistPictures.js';
import library from '../../src/renderer/mediator/handlers/library.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track } from '../helpers/tracks.js';

const songs = [track('a', { artist: 'Kora' }), track('b', { artist: 'Aurora Vega, Kora' })];
const homeArtists = (ctx) => callsOf(ctx.home.render).map(([data]) => data.artists.map((artist) => [artist.name, artist.picture]));

describe('handlers/artistPictures', () => {
  test('al cargar la biblioteca pide las fotos de sus artistas y repinta con las guardadas', async () => {
    const ctx = fakeContext({ library: spy({ load: songs, getArtistPictures: async () => ({ Kora: 'media://artist/k.jpg' }) }) });

    await library[EVENTS.APP_READY](ctx);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(callsOf(ctx.library.getArtistPictures), [[['Aurora Vega', 'Kora']]]);
    assert.deepEqual(homeArtists(ctx).at(-1), [
      ['Aurora Vega', null],
      ['Kora', 'media://artist/k.jpg'],
    ]);
    assert.equal(ctx.home.render.mock.callCount(), 2, 'una al cargar y otra con las fotos');
  });

  test('las que llegan después repintan Inicio y la colección abierta; si no cambia nada, no', () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'artist', key: 'Kora' } }) });
    ctx.catalog.add(songs);

    artistPictures[EVENTS.ARTIST_PICTURES_CHANGED](ctx, { Kora: 'media://artist/k.jpg' });
    artistPictures[EVENTS.ARTIST_PICTURES_CHANGED](ctx, { Kora: 'media://artist/k.jpg' });

    assert.equal(ctx.home.render.mock.callCount(), 1);
    assert.equal(callsOf(ctx.playlistView.render)[0][0].cover, 'media://artist/k.jpg');
  });

  test('si no se pueden pedir, se queda con las carátulas de las canciones', async () => {
    const ctx = fakeContext({ library: spy({ load: songs, getArtistPictures: async () => Promise.reject(new Error('sin main')) }) });
    await library[EVENTS.APP_READY](ctx);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ctx.home.render.mock.callCount(), 1);
  });
});
