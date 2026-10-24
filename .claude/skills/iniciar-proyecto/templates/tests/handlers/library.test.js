import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import library from '../../src/renderer/mediator/handlers/library.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);

describe('handlers/library', () => {
  test('app-ready carga la biblioteca guardada y pinta Inicio', async () => {
    const ctx = fakeContext({ library: spy({ load: async () => tracks('s3://m/a.mp3', 's3://m/b.mp3') }) });
    await library[EVENTS.APP_READY](ctx);
    assert.equal(ctx.catalog.size(), 2);
    assert.equal(callsOf(ctx.home.render)[0][0].isEmpty, false);
  });

  test('sync-library avisa mientras actualiza y si ya estaba al día', async () => {
    const ctx = fakeContext({ library: spy({ sync: async () => ({ added: 0, removed: 0 }) }) });
    await library[EVENTS.SYNC_LIBRARY](ctx);
    assert.deepEqual(toasts(ctx), ['Actualizando tu biblioteca…', 'Tu biblioteca ya está al día']);
  });

  test('si hay cambios no repite el aviso: llega con library-changed', async () => {
    const ctx = fakeContext({ library: spy({ sync: async () => ({ added: 3, removed: 1 }) }) });
    await library[EVENTS.SYNC_LIBRARY](ctx);
    assert.deepEqual(toasts(ctx), ['Actualizando tu biblioteca…']);
  });

  test('sin conexión con el almacenamiento avisa del error', async () => {
    const ctx = fakeContext({
      library: spy({
        sync: async () => {
          throw new Error('sin red');
        },
      }),
    });
    await library[EVENTS.SYNC_LIBRARY](ctx);
    assert.equal(toasts(ctx).at(-1), 'No se pudo conectar con el almacenamiento');
  });
});
