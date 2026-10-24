import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnrichmentQueue } from '../../../src/main/online/queue.js';
import { TransientError } from '../../../src/main/online/http.js';
import { memoryStore } from '../../helpers/memoryStore.js';

/** Reloj manual: los temporizadores solo avanzan con next(). */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    now: () => now,
    timers: {
      setTimeout: (fn, delay) => {
        pending.set(nextId, { fn, at: now + delay });
        return nextId++;
      },
      clearTimeout: (id) => pending.delete(id),
    },
    /** Retrasos pendientes, de menor a mayor. */
    delays: () => [...pending.values()].map(({ at }) => at - now).sort((a, b) => a - b),
    /** Ejecuta el temporizador más próximo y espera a que termine lo que dispare. */
    async next() {
      const [id, timer] = [...pending.entries()].sort(([, a], [, b]) => a.at - b.at)[0] ?? [];
      if (!timer) return false;
      pending.delete(id);
      now = timer.at;
      timer.fn();
      await settle();
      return true;
    },
    settle,
  };
}

const incomplete = (path) => ({ path, title: path, titleFromFile: false, artist: 'A', album: '', genre: '', year: 0, hasCover: false });
const found = (record) => ({ ...record, album: 'Álbum', online: { checkedAt: 1, status: 'found', source: 'iTunes' } });

function setup({ records = [incomplete('/a.mp3'), incomplete('/b.mp3')], enrich = async (record) => ({ record: found(record), changed: true }) } = {}) {
  const clock = manualClock();
  const store = memoryStore(records);
  const calls = [];
  const updates = [];
  const enricher = {
    enrich: async (record, options) => {
      calls.push([record.path, options]);
      return enrich(record, options);
    },
  };
  const queue = createEnrichmentQueue({ store, enricher, onUpdated: (tracks) => updates.push(tracks), timers: clock.timers, now: clock.now, interval: 3500, startDelay: 10_000, retryDelay: 60_000, flushDelay: 3000 });
  return { clock, store, calls, updates, queue };
}

describe('online/queue', () => {
  test('no hace nada hasta que se activa, y entonces espera al arranque', () => {
    const { clock, queue } = setup();
    queue.wake();
    assert.deepEqual(clock.delays(), []);
    queue.setEnabled(true);
    assert.deepEqual(clock.delays(), [10_000]);
  });

  test('completa una pista cada intervalo y avisa a la ventana en lote', async () => {
    const { clock, store, calls, updates, queue } = setup();
    queue.setEnabled(true);

    await clock.next(); // arranque → /a.mp3
    assert.deepEqual(calls.map(([path]) => path), ['/a.mp3']);
    assert.deepEqual(clock.delays(), [3000, 3500]); // aviso en lote y siguiente pista

    await clock.next(); // aviso en lote
    assert.equal(store.saves, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0].path, '/a.mp3');
    assert.match(updates[0][0].url, /^media:\/\/track\//);

    await clock.next(); // siguiente pista → /b.mp3
    assert.deepEqual(calls.map(([path]) => path), ['/a.mp3', '/b.mp3']);
  });

  test('cuando está al día se para y wake() la reanuda', async () => {
    const { clock, calls, store, queue } = setup({ records: [incomplete('/a.mp3')] });
    queue.setEnabled(true);
    await clock.next(); // /a.mp3
    await clock.next(); // aviso
    await clock.next(); // nada pendiente
    assert.deepEqual(clock.delays(), []);

    store.add([incomplete('/nueva.mp3')]);
    queue.wake();
    await clock.next();
    assert.deepEqual(calls.map(([path]) => path), ['/a.mp3', '/nueva.mp3']);
  });

  test('desactivarla cancela lo programado', () => {
    const { clock, queue } = setup();
    queue.setEnabled(true);
    queue.setEnabled(false);
    assert.deepEqual(clock.delays(), []);
  });

  test('sin conexión espera un minuto y reintenta la misma pista', async () => {
    let offline = true;
    const { clock, calls, queue } = setup({
      enrich: async (record) => {
        if (offline) throw new TransientError('sin red');
        return { record: found(record), changed: true };
      },
    });
    queue.setEnabled(true);

    await clock.next();
    assert.deepEqual(clock.delays(), [60_000]);

    offline = false;
    await clock.next();
    assert.deepEqual(calls.map(([path]) => path), ['/a.mp3', '/a.mp3']);
  });

  test('un error inesperado marca la pista para no atascarse y sigue con la siguiente', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const { clock, calls, store, queue } = setup({
      enrich: async (record) => {
        if (record.path === '/a.mp3') throw new Error('disco lleno');
        return { record: found(record), changed: true };
      },
    });
    queue.setEnabled(true);

    await clock.next(); // /a.mp3 falla
    assert.equal(store.get('/a.mp3').online.status, 'error');
    await clock.next(); // aviso
    await clock.next(); // /b.mp3
    assert.deepEqual(calls.map(([path]) => path), ['/a.mp3', '/b.mp3']);
  });

  test('lookupNow() busca al momento con las opciones dadas, guarda y devuelve la pista', async () => {
    const { calls, store, queue } = setup();

    const result = await queue.lookupNow('/a.mp3', { force: true, lyrics: true });

    assert.deepEqual(calls, [['/a.mp3', { force: true, lyrics: true }]]);
    assert.equal(result.changed, true);
    assert.equal(result.track.album, 'Álbum');
    assert.equal(store.saves, 1);
    assert.equal(await queue.lookupNow('/no-existe.mp3'), null);
  });

  test('lookupNow() propaga la falta de conexión', async () => {
    const { queue } = setup({
      enrich: async () => {
        throw new TransientError('sin red');
      },
    });
    await assert.rejects(queue.lookupNow('/a.mp3'), TransientError);
  });

  test('las búsquedas van en fila: lookupNow() espera a la que está en curso', async () => {
    let release;
    const order = [];
    const { clock, queue } = setup({
      enrich: async (record, options) => {
        order.push(`empieza ${record.path}${options?.force ? ' (manual)' : ''}`);
        if (!options) await new Promise((resolve) => (release = resolve));
        order.push(`termina ${record.path}`);
        return { record: found(record), changed: true };
      },
    });
    queue.setEnabled(true);
    await clock.next(); // empieza /a.mp3 en segundo plano y se queda esperando

    const manual = queue.lookupNow('/b.mp3', { force: true });
    await clock.settle();
    assert.deepEqual(order, ['empieza /a.mp3']);

    release();
    await manual;
    assert.deepEqual(order, ['empieza /a.mp3', 'termina /a.mp3', 'empieza /b.mp3 (manual)', 'termina /b.mp3']);
  });
});
