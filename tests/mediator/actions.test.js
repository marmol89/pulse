import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPlayer,
  loadTrack,
  playCollection,
  playCurrentOrClear,
  openCollection,
  refreshHome,
  refreshLibraryViews,
  removeTracks,
  resolveCollection,
  showModes,
  trackListState,
} from '../../src/renderer/mediator/actions.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track, tracks } from '../helpers/tracks.js';

describe('actions', () => {
  test('loadTrack() carga el audio y sincroniza todas las vistas', () => {
    const ctx = fakeContext();
    const neon = track('/neon.mp3');
    ctx.favorites.toggle(neon.path);

    assert.equal(loadTrack(ctx, neon), true);

    assert.deepEqual(callsOf(ctx.audio.load), [[neon.url, true]]);
    assert.deepEqual(callsOf(ctx.controls.show), [[neon, true]]);
    assert.deepEqual(callsOf(ctx.nowPlaying.show), [[neon, true]]);
    assert.deepEqual(callsOf(ctx.mediaSession.show), [[neon]]);
    for (const view of [ctx.playlistView, ctx.search, ctx.home]) {
      assert.deepEqual(callsOf(view.highlight), [[neon.path]]);
    }
  });

  test('loadTrack() sin pista no hace nada', () => {
    const ctx = fakeContext();
    assert.equal(loadTrack(ctx, null), false);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
  });

  test('resolveCollection() combina modelos para cola, favoritos, recientes y mix', () => {
    const ctx = fakeContext();
    const [a, b, c] = tracks('a', 'b', 'c');
    ctx.catalog.add([a, b, c]);
    ctx.playlist.setQueue([c, a]);
    ctx.favorites.toggle('b');
    ctx.recents.add('c');

    assert.deepEqual(resolveCollection(ctx, { kind: 'queue' }).tracks, [c, a]);
    assert.deepEqual(resolveCollection(ctx, { kind: 'favorites' }).tracks, [b]);
    assert.deepEqual(resolveCollection(ctx, { kind: 'recents' }).tracks, [c]);
    assert.equal(resolveCollection(ctx, { kind: 'mix' }).title, 'Mix diario');
    assert.equal(resolveCollection(ctx, { kind: 'library' }).tracks.length, 3);
  });

  test('playCollection() convierte la colección en la cola y reproduce desde la pista elegida', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.catalog.add([a, b]);

    playCollection(ctx, { kind: 'library' }, 'b');

    assert.equal(ctx.playlist.current(), b);
    assert.deepEqual(callsOf(ctx.nowPlaying.setContext), [['Tu biblioteca']]);
    assert.deepEqual(callsOf(ctx.audio.load), [[b.url, true]]);
  });

  test('playCollection() con una colección vacía no carga nada', () => {
    const ctx = fakeContext();
    assert.equal(playCollection(ctx, { kind: 'favorites' }), false);
    assert.equal(ctx.nowPlaying.setContext.mock.callCount(), 0);
  });

  test('openCollection() pinta la colección, cierra el overlay y muestra la vista', () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a'));

    openCollection(ctx, { kind: 'library' });

    const [[collection, state]] = callsOf(ctx.playlistView.render);
    assert.equal(collection.title, 'Tu biblioteca');
    assert.deepEqual(state, { favorites: new Set(), currentPath: null, playing: false });
    assert.equal(ctx.router.closeOverlay.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.router.show), [['collection', 'library']]);
  });

  test('refreshHome() envía a Inicio recientes, géneros, álbumes, artistas y favoritos', () => {
    const ctx = fakeContext();
    const a = track('a', { genre: 'Lo-fi', album: 'X' });
    ctx.catalog.add([a]);
    ctx.recents.add('a');
    ctx.favorites.toggle('a');

    refreshHome(ctx);

    const [[data]] = callsOf(ctx.home.render);
    assert.equal(data.isEmpty, false);
    assert.deepEqual(data.recents, [a]);
    assert.deepEqual(data.genres, [{ name: 'Lo-fi', count: 1 }]);
    assert.equal(data.albums.length, 1);
    assert.equal(data.artists.length, 1);
    assert.deepEqual(data.favoriteTracks, [a]);
    assert.ok(data.favorites.has('a'));
  });

  test('trackListState() refleja la pista actual y si está sonando', () => {
    const ctx = fakeContext();
    ctx.playlist.setQueue(tracks('a'));
    ctx.audio.isPlaying.mock.mockImplementation(() => true);
    assert.deepEqual(trackListState(ctx), { favorites: new Set(), currentPath: 'a', playing: true });
  });

  test('removeTracks() quita las pistas de modelos y vistas e indica si era la actual', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.catalog.add([a, b]);
    ctx.playlist.setQueue([a, b], 'b');

    assert.equal(removeTracks(ctx, ['a']), false);
    assert.equal(removeTracks(ctx, ['b']), true);
    assert.equal(removeTracks(ctx, []), false);

    assert.equal(ctx.catalog.size(), 0);
    assert.equal(ctx.playlist.size(), 0);
    assert.deepEqual(callsOf(ctx.search.removeTracks), [[['a']], [['b']]]);
  });

  test('playCurrentOrClear() carga la pista actual o vacía el reproductor si no hay', () => {
    const ctx = fakeContext();
    const [a] = tracks('a');
    ctx.playlist.setQueue([a]);
    playCurrentOrClear(ctx, false);
    assert.deepEqual(callsOf(ctx.audio.load), [[a.url, false]]);

    const empty = fakeContext();
    playCurrentOrClear(empty, true);
    assert.equal(empty.audio.stop.mock.callCount(), 1);
  });

  test('clearPlayer() para el audio, cierra Reproduciendo y deja la player bar vacía', () => {
    const ctx = fakeContext();
    clearPlayer(ctx);
    assert.equal(ctx.audio.stop.mock.callCount(), 1);
    assert.equal(ctx.router.closeOverlay.mock.callCount(), 1);
    assert.equal(ctx.controls.clear.mock.callCount(), 1);
    assert.equal(ctx.mediaSession.clear.mock.callCount(), 1);
    for (const view of [ctx.playlistView, ctx.search, ctx.home]) assert.deepEqual(callsOf(view.highlight), [[null]]);
  });

  test('refreshLibraryViews() repinta Inicio y la colección abierta, si la hay', () => {
    const closed = fakeContext();
    refreshLibraryViews(closed);
    assert.equal(closed.home.render.mock.callCount(), 1);
    assert.equal(closed.playlistView.render.mock.callCount(), 0);

    const open = fakeContext({ playlistView: spy({ source: { kind: 'library' } }) });
    refreshLibraryViews(open);
    assert.equal(open.playlistView.render.mock.callCount(), 1);
  });

  test('showModes() refleja aleatorio y repetir en las tres vistas con controles', () => {
    const ctx = fakeContext();
    ctx.playlist.setShuffle(true);
    showModes(ctx);
    const expected = [[{ shuffle: true, repeat: 'off' }]];
    assert.deepEqual(callsOf(ctx.controls.setModes), expected);
    assert.deepEqual(callsOf(ctx.nowPlaying.setModes), expected);
    assert.deepEqual(callsOf(ctx.playlistView.setModes), expected);
  });
});
