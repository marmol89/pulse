import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAvailabilityMonitor, fileExists } from '../../src/main/library/availability.js';
import { memoryStore } from '../helpers/memoryStore.js';

const DAY = 24 * 60 * 60 * 1000;
const record = (filePath, fields = {}) => ({ path: filePath, title: path.basename(filePath), hasCover: false, ...fields });

function setup({ records = [], present = new Set(), time = 1000 } = {}) {
  const store = memoryStore(records);
  const changes = [];
  const clock = { time };
  const monitor = createAvailabilityMonitor({
    store,
    onChange: (change) => changes.push(change),
    exists: async (filePath) => present.has(filePath),
    now: () => clock.time,
    minInterval: 15_000,
  });
  return { store, changes, clock, monitor, present };
}

describe('library/availability', () => {
  describe('fileExists()', () => {
    let dir;
    before(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'pulse-exists-'));
      await writeFile(path.join(dir, 'a.mp3'), '');
      await mkdir(path.join(dir, 'carpeta'));
    });
    after(() => rm(dir, { recursive: true, force: true }));

    test('distingue archivos existentes, borrados, carpetas y rutas imposibles', async () => {
      assert.equal(await fileExists(path.join(dir, 'a.mp3')), true);
      assert.equal(await fileExists(path.join(dir, 'borrado.mp3')), false);
      assert.equal(await fileExists(path.join(dir, 'carpeta')), false);
      assert.equal(await fileExists(path.join(dir, 'a.mp3', 'dentro.mp3')), false);
    });
  });

  test('check() oculta las que faltan, avisa una sola vez y guarda', async () => {
    const { store, changes, monitor } = setup({ records: [record('/a.mp3'), record('/b.mp3')], present: new Set(['/a.mp3']) });

    assert.deepEqual(await monitor.check(), { removed: ['/b.mp3'], restored: [] });
    assert.equal(store.get('/b.mp3').missingSince, 1000);
    assert.equal(store.saves, 1);

    await monitor.check();
    assert.equal(changes.length, 1, 'no repite el aviso');
    assert.equal(store.saves, 1, 'sin cambios no guarda');
  });

  test('check() recupera las que vuelven con sus datos (p. ej. al reconectar un disco)', async () => {
    const { store, changes, monitor } = setup({ records: [record('/b.mp3', { missingSince: 500, album: 'VIDA' })], present: new Set(['/b.mp3']) });

    await monitor.check();

    assert.equal('missingSince' in store.get('/b.mp3'), false);
    assert.equal(changes[0].restored[0].album, 'VIDA');
    assert.match(changes[0].restored[0].url, /^media:\/\/track\//);
  });

  test('check() olvida las que llevan más de 30 días ausentes, sin avisar', async () => {
    const { store, changes, monitor, clock } = setup({ records: [record('/viejo.mp3', { missingSince: 0 }), record('/reciente.mp3', { missingSince: 0 })] });
    clock.time = 31 * DAY;
    store.add([record('/reciente.mp3', { missingSince: 20 * DAY })]);

    await monitor.check();

    assert.equal(store.has('/viejo.mp3'), false);
    assert.equal(store.has('/reciente.mp3'), true);
    assert.equal(changes.length, 0);
    assert.equal(store.saves, 1);
  });

  test('dos check() a la vez comparten la misma comprobación', async () => {
    let calls = 0;
    const store = memoryStore([record('/a.mp3')]);
    const monitor = createAvailabilityMonitor({ store, onChange() {}, exists: async () => (calls += 1) > 0 });
    await Promise.all([monitor.check(), monitor.check()]);
    assert.equal(calls, 1);
  });

  test('checkSoon() no repite la comprobación antes de 15 s', async () => {
    const { monitor, clock, present, changes } = setup({ records: [record('/a.mp3')], present: new Set(['/a.mp3']) });
    await monitor.check();
    present.delete('/a.mp3');

    clock.time += 5000;
    monitor.checkSoon();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(changes.length, 0);

    clock.time += 15_000;
    monitor.checkSoon();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(changes, [{ removed: ['/a.mp3'], restored: [] }]);
  });

  test('verify() comprueba una pista: si falta la marca; si está la da por buena', async () => {
    const { store, monitor } = setup({ records: [record('/a.mp3'), record('/b.mp3')], present: new Set(['/a.mp3']) });
    assert.equal(await monitor.verify('/a.mp3'), true);
    assert.equal(await monitor.verify('/b.mp3'), false);
    assert.equal(store.get('/b.mp3').missingSince, 1000);
    assert.equal(await monitor.verify('/no-esta-en-la-biblioteca.mp3'), false);
  });

  test('verify() da la pista por disponible si el disco tarda demasiado en responder', async () => {
    const store = memoryStore([record('//servidor/musica/a.mp3')]);
    const monitor = createAvailabilityMonitor({ store, onChange() {}, exists: () => new Promise(() => {}), verifyTimeout: 20 });
    assert.equal(await monitor.verify('//servidor/musica/a.mp3'), true);
    assert.equal('missingSince' in store.get('//servidor/musica/a.mp3'), false);
  });
});
