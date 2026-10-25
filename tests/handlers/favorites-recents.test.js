import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import favorites from '../../src/renderer/mediator/handlers/favorites.js';
import recents from '../../src/renderer/mediator/handlers/recents.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';
import { Favorites } from '../../src/renderer/colleagues/Favorites.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';

describe('handlers/favorites', () => {
  test('toggle-favorite marca la ruta indicada al momento, actualiza todos los corazones y lo guarda en el main', async () => {
    const ctx = fakeContext();

    await favorites[EVENTS.TOGGLE_FAVORITE](ctx, '/a.mp3');

    assert.equal(ctx.favorites.has('/a.mp3'), true);
    for (const view of [ctx.controls, ctx.nowPlaying, ctx.playlistView, ctx.search, ctx.home]) {
      assert.deepEqual(callsOf(view.setFavorite), [['/a.mp3', true]]);
    }
    assert.equal(ctx.home.render.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.library.setFavorite), [['/a.mp3', true]]);
  });

  test('sin ruta usa la pista actual; sin pista no hace nada', async () => {
    const ctx = fakeContext();
    await favorites[EVENTS.TOGGLE_FAVORITE](ctx);
    assert.equal(ctx.controls.setFavorite.mock.callCount(), 0);

    ctx.playlist.setQueue(tracks('a'));
    await favorites[EVENTS.TOGGLE_FAVORITE](ctx);
    assert.equal(ctx.favorites.has('a'), true);
  });

  test('si el main no puede guardarlo, el corazón vuelve como estaba y se explica', async () => {
    const error = 'Conecta tu bucket para guardar favoritos';
    const ctx = fakeContext({ library: spy({ setFavorite: { ok: false, error } }) });

    await favorites[EVENTS.TOGGLE_FAVORITE](ctx, 'a');

    assert.equal(ctx.favorites.has('a'), false);
    assert.deepEqual(callsOf(ctx.controls.setFavorite), [['a', true], ['a', false]]);
    assert.deepEqual(callsOf(ctx.toast.show), [[error, { tone: 'error' }]]);
  });

  test('app-ready trae los del bucket y repinta los corazones que cambian', async () => {
    const ctx = fakeContext({ library: spy({ favorites: ['b', 'a'] }) });
    ctx.catalog.add(tracks('a', 'b'));

    await favorites[EVENTS.APP_READY](ctx);

    assert.deepEqual(ctx.favorites.list(), ['b', 'a']);
    assert.deepEqual(callsOf(ctx.controls.setFavorite), [['a', true], ['b', true]]);
    assert.deepEqual(callsOf(ctx.home.render)[0][0].favoriteTracks.map((t) => t.path), ['b', 'a']);
    assert.equal(ctx.library.importFavorites.mock.callCount(), 0);
  });

  test('app-ready sube una vez los de cuando solo eran de este equipo; sin conexión se quedan', async () => {
    const ctx = fakeContext({ library: spy({ importFavorites: { ok: false, error: 'Conecta tu bucket para guardar favoritos' } }) });
    ctx.favorites = new Favorites(createStorage(createMemoryBackend({ 'pulse.favorites': JSON.stringify(['a', 'b']) })));

    await favorites[EVENTS.APP_READY](ctx);
    assert.deepEqual(ctx.favorites.list(), ['b', 'a'], 'sin conexión se siguen viendo');
    assert.deepEqual(ctx.favorites.legacy(), ['a', 'b']);

    ctx.library = spy({ importFavorites: { ok: true, favorites: ['c', 'b', 'a'] } });
    await favorites[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.library.importFavorites), [[['a', 'b']]]);
    assert.deepEqual(ctx.favorites.list(), ['c', 'b', 'a']);
    assert.deepEqual(ctx.favorites.legacy(), [], 'ya no se vuelven a subir');
  });

  test('favorites-changed repinta los corazones y, si está abierta, "Tus favoritos"', async () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'favorites' } }) });
    ctx.catalog.add(tracks('a', 'b'));
    ctx.favorites.toggle('a');

    favorites[EVENTS.FAVORITES_CHANGED](ctx, ['b']);

    assert.deepEqual(callsOf(ctx.search.setFavorite), [['a', false], ['b', true]]);
    assert.deepEqual(callsOf(ctx.playlistView.render)[0][0].tracks.map((t) => t.path), ['b']);
  });
});

describe('handlers/recents', () => {
  test('track-started añade la pista actual a recientes y refresca Inicio', () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b'));
    ctx.playlist.setQueue(tracks('a', 'b'), 'b');

    recents[EVENTS.TRACK_STARTED](ctx);

    assert.deepEqual(ctx.recents.list(), ['b']);
    assert.deepEqual(callsOf(ctx.home.render)[0][0].recents.map((t) => t.path), ['b']);
  });

  test('track-started sin cola no hace nada', () => {
    const ctx = fakeContext();
    recents[EVENTS.TRACK_STARTED](ctx);
    assert.deepEqual(ctx.recents.list(), []);
  });
});
