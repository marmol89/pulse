import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import changes from '../../src/renderer/mediator/handlers/changes.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track } from '../helpers/tracks.js';

const a = track('/m/a.mp3');
const b = track('/m/b.mp3');
const c = track('/m/c.mp3');

function library({ queue = [a, b, c], current = a, playing = true, source = null } = {}) {
  const ctx = fakeContext({ audio: spy({ isPlaying: playing }), playlistView: spy({ source }) });
  ctx.catalog.add([a, b, c]);
  ctx.playlist.setQueue(queue, current.path);
  return ctx;
}

const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);

describe('handlers/changes', () => {
  test('quita de todas partes las que ya no están, sin cortar la que suena', () => {
    const ctx = library();

    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [b.path], added: [] });

    assert.equal(ctx.catalog.get(b.path), null);
    assert.deepEqual(ctx.playlist.tracks(), [a, c]);
    for (const view of [ctx.playlistView, ctx.search, ctx.home]) assert.deepEqual(callsOf(view.removeTracks), [[[b.path]]]);
    assert.equal(ctx.home.render.mock.callCount(), 1);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.deepEqual(toasts(ctx), ['1 canción ya no está en el bucket']);
  });

  test('si sonaba una de las que faltan, sigue sonando la siguiente', () => {
    const ctx = library({ current: b, playing: true });
    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [b.path], added: [] });
    assert.deepEqual(callsOf(ctx.audio.load), [[c.url, true]]);
  });

  test('si estaba en pausa, la siguiente queda lista sin sonar', () => {
    const ctx = library({ current: b, playing: false });
    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [b.path, a.path], added: [] });
    assert.deepEqual(callsOf(ctx.audio.load), [[c.url, false]]);
    assert.deepEqual(toasts(ctx), ['2 canciones ya no están en el bucket']);
  });

  test('si no queda nada en la cola, el reproductor queda vacío', () => {
    const ctx = library({ queue: [a], current: a });
    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [a.path], added: [] });
    assert.equal(ctx.audio.stop.mock.callCount(), 1);
    assert.equal(ctx.controls.clear.mock.callCount(), 1);
  });

  test('las nuevas aparecen en la biblioteca y en la colección abierta', () => {
    const ctx = library({ source: { kind: 'library' } });
    const back = [track('/m/d.mp3'), track('/m/e.mp3')];

    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [], added: back });

    assert.equal(ctx.catalog.size(), 5);
    assert.equal(callsOf(ctx.playlistView.render)[0][0].tracks.length, 5);
    assert.deepEqual(toasts(ctx), ['2 canciones nuevas']);
  });

  test('con cambios de los dos tipos el aviso los junta; sin cambios no avisa', () => {
    const ctx = library();
    changes[EVENTS.LIBRARY_CHANGED](ctx, { removed: [b.path], added: [track('/m/d.mp3')] });
    assert.deepEqual(toasts(ctx), ['1 canción nueva · 1 canción ya no está en el bucket']);

    const quiet = library();
    changes[EVENTS.LIBRARY_CHANGED](quiet, {});
    assert.equal(quiet.toast.show.mock.callCount(), 0);
  });
});
