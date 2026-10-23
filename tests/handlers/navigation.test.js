import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import navigation from '../../src/renderer/mediator/handlers/navigation.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { albumKey } from '../../src/renderer/colleagues/Catalog.js';
import { fakeContext, callsOf } from '../helpers/fakeContext.js';
import { track, tracks } from '../helpers/tracks.js';

const loadedUrls = (ctx) => callsOf(ctx.audio.load).map(([url]) => url);

describe('handlers/navigation', () => {
  test('ended avanza a la siguiente pista de la cola', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.playlist.setQueue([a, b]);

    navigation[EVENTS.ENDED](ctx);

    assert.deepEqual(loadedUrls(ctx), [b.url]);
    assert.equal(ctx.playlist.current(), b);
  });

  test('ended en la última pista sin repetir no carga nada', () => {
    const ctx = fakeContext();
    ctx.playlist.setQueue(tracks('a'));
    navigation[EVENTS.ENDED](ctx);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
  });

  test('ended con repetir una vuelve a cargar la misma pista', () => {
    const ctx = fakeContext();
    const [a] = tracks('a', 'b');
    ctx.playlist.setQueue(tracks('a', 'b'));
    ctx.playlist.cycleRepeat();
    ctx.playlist.cycleRepeat();

    navigation[EVENTS.ENDED](ctx);

    assert.deepEqual(loadedUrls(ctx), [a.url]);
  });

  test('track-selected convierte la colección en la cola y carga la pista elegida', () => {
    const ctx = fakeContext();
    const intro = track('/intro.mp3', { album: 'Neón', trackNo: 1 });
    const neon = track('/neon.mp3', { album: 'Neón', trackNo: 2 });
    const otra = track('/otra.mp3', { album: 'Otro' });
    ctx.catalog.add([neon, otra, intro]);

    navigation[EVENTS.TRACK_SELECTED](ctx, { source: { kind: 'album', key: albumKey(neon) }, path: neon.path });

    assert.deepEqual(loadedUrls(ctx), [neon.url]);
    assert.deepEqual(ctx.playlist.tracks(), [intro, neon]);
    assert.deepEqual(callsOf(ctx.nowPlaying.setContext), [['Neón']]);
  });

  test('play-collection reproduce la colección desde el principio', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.catalog.add([a, b]);
    navigation[EVENTS.PLAY_COLLECTION](ctx, { kind: 'library' });
    assert.deepEqual(loadedUrls(ctx), [a.url]);
  });

  test('next carga la siguiente pista', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.playlist.setQueue([a, b]);
    navigation[EVENTS.NEXT](ctx);
    assert.deepEqual(loadedUrls(ctx), [b.url]);
  });

  test('previous reinicia la pista si ya avanzó más de 3 segundos', () => {
    const ctx = fakeContext();
    ctx.playlist.setQueue(tracks('a', 'b'), 'b');
    ctx.audio.currentTime.mock.mockImplementation(() => 10);

    navigation[EVENTS.PREVIOUS](ctx);

    assert.deepEqual(callsOf(ctx.audio.seek), [[0]]);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
  });

  test('previous al principio de la pista vuelve a la anterior', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.playlist.setQueue([a, b], 'b');
    navigation[EVENTS.PREVIOUS](ctx);
    assert.deepEqual(loadedUrls(ctx), [a.url]);
  });

  test('previous en la primera pista la reinicia', () => {
    const ctx = fakeContext();
    ctx.playlist.setQueue(tracks('a', 'b'));
    navigation[EVENTS.PREVIOUS](ctx);
    assert.deepEqual(callsOf(ctx.audio.seek), [[0]]);
  });
});
