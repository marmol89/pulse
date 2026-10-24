import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import errors from '../../src/renderer/mediator/handlers/errors.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track } from '../helpers/tracks.js';

const a = track('/m/a.mp3', { title: 'Canción A' });
const b = track('/m/b.mp3', { title: 'Canción B' });
const c = track('/m/c.mp3', { title: 'Canción C' });

function failing(queue, current, { verify = true, consecutiveErrors = 1 } = {}) {
  const ctx = fakeContext({
    audio: spy({ consecutiveErrors, isPlaying: false }),
    library: spy({ verify: typeof verify === 'function' ? verify : async () => verify }),
  });
  ctx.catalog.add(queue);
  ctx.playlist.setQueue(queue, current.path);
  return ctx;
}

const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);
const loaded = (ctx) => callsOf(ctx.audio.load);

describe('handlers/errors', () => {
  test('si el archivo existe, avisa del error y salta a la siguiente', async () => {
    const ctx = failing([a, b], a);

    await errors[EVENTS.ERROR](ctx, { message: 'No se puede reproducir este formato de audio' });

    assert.deepEqual(callsOf(ctx.library.verify), [[a.path]]);
    assert.deepEqual(toasts(ctx), ['No se puede reproducir este formato de audio']);
    assert.deepEqual(loaded(ctx), [[b.url, true]]);
  });

  test('si fallan todas las pistas seguidas se detiene en vez de girar en bucle', async () => {
    const ctx = failing([a, b], a, { consecutiveErrors: 2 });
    ctx.playlist.cycleRepeat();

    await errors[EVENTS.ERROR](ctx, {});

    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.deepEqual(toasts(ctx), ['No se pudo reproducir la pista']);
  });

  test('si el archivo ya no existe, lo quita de la biblioteca y sigue con la siguiente', async () => {
    const ctx = failing([a, b, c], b, { verify: false });

    await errors[EVENTS.ERROR](ctx, {});

    assert.deepEqual(toasts(ctx), ['«Canción B» ya no está en el disco: se ha quitado de la biblioteca']);
    assert.equal(ctx.catalog.get(b.path), null);
    assert.deepEqual(ctx.playlist.tracks(), [a, c]);
    for (const view of [ctx.playlistView, ctx.search, ctx.home]) assert.deepEqual(callsOf(view.removeTracks), [[[b.path]]]);
    assert.deepEqual(loaded(ctx), [[c.url, true]]);
  });

  test('si faltaba la última de la cola, el reproductor queda vacío', async () => {
    const ctx = failing([a, b], b, { verify: false });

    await errors[EVENTS.ERROR](ctx, {});

    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.equal(ctx.audio.stop.mock.callCount(), 1);
    assert.equal(ctx.controls.clear.mock.callCount(), 1);
    assert.equal(ctx.mediaSession.clear.mock.callCount(), 1);
    assert.equal(ctx.router.closeOverlay.mock.callCount(), 1);
  });

  test('si el proceso main no responde, no se quita nada y se trata como un error normal', async () => {
    const ctx = failing([a, b], a, {
      verify: async () => {
        throw new Error('sin respuesta');
      },
    });

    await errors[EVENTS.ERROR](ctx, { message: 'Error al leer el archivo' });

    assert.equal(ctx.catalog.size(), 2);
    assert.deepEqual(toasts(ctx), ['Error al leer el archivo']);
  });

  test('si mientras se comprobaba el usuario eligió otra pista, no la salta', async () => {
    let answer;
    const ctx = failing([a, b, c], a, { verify: () => new Promise((resolve) => (answer = resolve)) });

    const handling = errors[EVENTS.ERROR](ctx, { message: 'fallo' });
    ctx.playlist.setQueue([a, b, c], c.path); // el usuario elige "Canción C"
    answer(true);
    await handling;

    assert.equal(ctx.toast.show.mock.callCount(), 0);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.equal(ctx.playlist.current(), c);
  });
});
