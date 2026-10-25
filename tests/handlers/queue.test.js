import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import queue from '../../src/renderer/mediator/handlers/queue.js';
import navigation from '../../src/renderer/mediator/handlers/navigation.js';
import resume from '../../src/renderer/mediator/handlers/resume.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const LIBRARY = tracks('a', 'b', 'c', 'x');
const order = (ctx) => ctx.playlist.ordered().map((track) => track.path);
const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);

function playing(overrides) {
  const ctx = fakeContext(overrides);
  ctx.catalog.add(LIBRARY);
  ctx.playlist.setQueue(tracks('a', 'b', 'c'), 'a');
  return ctx;
}

describe('handlers/queue', () => {
  test('"Reproducir a continuación" la pone detrás de la que suena, sin cortar la actual', () => {
    const ctx = playing();
    queue[EVENTS.PLAY_NEXT](ctx, ['x']);
    assert.deepEqual(order(ctx), ['a', 'x', 'b', 'c']);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.deepEqual(toasts(ctx), ['Sonará a continuación']);
  });

  test('"Añadir a la cola" la pone al final y se guarda para retomarla', () => {
    const ctx = playing();
    queue[EVENTS.ENQUEUE](ctx, ['x']);
    resume[EVENTS.ENQUEUE](ctx, ['x']);
    assert.deepEqual(order(ctx), ['a', 'b', 'c', 'x']);
    assert.deepEqual(ctx.session.load().queue.paths.at(-1), 'x');
    assert.deepEqual(toasts(ctx), ['Añadida a la cola']);
  });

  test('sin nada sonando, lo añadido empieza a sonar', () => {
    const ctx = fakeContext();
    ctx.catalog.add(LIBRARY);
    queue[EVENTS.ENQUEUE](ctx, ['b', 'c']);
    assert.deepEqual(callsOf(ctx.audio.load), [[LIBRARY[1].url, true]]);
    assert.deepEqual(toasts(ctx), ['2 canciones: añadida a la cola']);
  });

  test('la que ya suena no se añade ni avisa', () => {
    const ctx = playing();
    queue[EVENTS.PLAY_NEXT](ctx, ['a']);
    assert.deepEqual(toasts(ctx), []);
  });

  test('"Ver la cola" se repinta y quitar la que suena pasa a la siguiente', () => {
    const ctx = playing({ playlistView: spy({ source: { kind: 'queue' } }), audio: spy({ isPlaying: true }) });
    queue[EVENTS.REMOVE_FROM_QUEUE](ctx, 'a');
    assert.deepEqual(order(ctx), ['b', 'c']);
    assert.deepEqual(callsOf(ctx.audio.load), [[LIBRARY[1].url, true]]);
    assert.deepEqual(callsOf(ctx.playlistView.render)[0][0].tracks.map((track) => track.path), ['b', 'c']);
  });

  test('elegir una pista en "Ver la cola" salta a ella sin rehacer la cola', () => {
    const ctx = playing();
    ctx.playlist.setShuffle(true);
    const before = order(ctx);
    navigation[EVENTS.TRACK_SELECTED](ctx, { source: { kind: 'queue' }, path: before[2] });
    assert.deepEqual(order(ctx), before);
    assert.equal(ctx.playlist.current().path, before[2]);
  });
});
