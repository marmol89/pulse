import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import favorites from '../../src/renderer/mediator/handlers/favorites.js';
import recents from '../../src/renderer/mediator/handlers/recents.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/favorites', () => {
  test('toggle-favorite marca la ruta indicada y actualiza todos los corazones', () => {
    const ctx = fakeContext();

    favorites[EVENTS.TOGGLE_FAVORITE](ctx, '/a.mp3');

    assert.equal(ctx.favorites.has('/a.mp3'), true);
    for (const view of [ctx.controls, ctx.nowPlaying, ctx.playlistView, ctx.search, ctx.home]) {
      assert.deepEqual(callsOf(view.setFavorite), [['/a.mp3', true]]);
    }
    assert.equal(ctx.home.render.mock.callCount(), 1);
  });

  test('sin ruta usa la pista actual; sin pista no hace nada', () => {
    const ctx = fakeContext();
    favorites[EVENTS.TOGGLE_FAVORITE](ctx);
    assert.equal(ctx.controls.setFavorite.mock.callCount(), 0);

    ctx.playlist.setQueue(tracks('a'));
    favorites[EVENTS.TOGGLE_FAVORITE](ctx);
    assert.equal(ctx.favorites.has('a'), true);
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
