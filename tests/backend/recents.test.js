import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRecentStore, RECENTS_FILE } from '../../src/backend/library/recents.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const REMOTE = 'metadatos/recientes.json';
const A = 's3://musica/a.mp3';
const B = 's3://musica/b.mp3';
const C = 's3://musica/c.mp3';
/** Temporizadores que nunca se disparan: cada test sincroniza a mano y no quedan reintentos vivos. */
const IDLE_TIMERS = { setTimeout: () => 1, clearTimeout: () => {} };

describe('library/recents', () => {
  let s3;
  let storages;
  let clock;

  /** Un "equipo" con Pulse: sus archivos, su reloj y su conexión al mismo bucket. */
  function device({ files = memoryFiles(), storage = createS3Storage(s3.config), changes = [] } = {}) {
    storages.push(storage);
    const recents = createRecentStore({ files, getStorage: () => storage, onChange: (all) => changes.push(all), now: () => clock, minInterval: 0, timers: IDLE_TIMERS });
    return { recents, files, changes, storage };
  }

  before(async () => {
    s3 = await startFakeS3();
  });
  after(() => s3.close());
  beforeEach(() => {
    s3.remove('musica', REMOTE);
    storages = [];
    clock = 1_000;
  });
  afterEach(() => {
    for (const storage of storages) storage.destroy();
  });

  test('la última que sonó primero, sin repetidas, y se guarda en este equipo', async () => {
    const { recents, files } = device();
    await recents.add(A);
    await recents.add(B);
    assert.deepEqual(await recents.add(A), [A, B]);
    assert.equal(JSON.parse(files.text(RECENTS_FILE)).recents.length, 2);
    await assert.rejects(recents.add('/disco/a.mp3'), /no está en tu biblioteca/);
  });

  test('se ven las 12 últimas', async () => {
    const { recents } = device();
    for (let i = 0; i < 15; i += 1) await recents.add(`s3://musica/${i}.mp3`);
    const all = recents.all();
    assert.equal(all.length, 12);
    assert.equal(all[0], 's3://musica/14.mp3');
  });

  test('otro equipo las recibe y, al juntar copias, gana la escucha más reciente', async () => {
    const pc = device();
    const phone = device();
    await pc.recents.add(A);
    await pc.recents.add(B);
    await pc.recents.sync();
    await phone.recents.sync();
    assert.deepEqual(phone.recents.all(), [B, A]);
    assert.deepEqual(phone.changes, [[B, A]]);

    clock = 5_000;
    await phone.recents.add(A); // en el móvil, A vuelve a sonar después
    clock = 6_000;
    await pc.recents.add(C);
    await phone.recents.sync();
    await pc.recents.sync();
    await phone.recents.sync();
    for (const { recents } of [pc, phone]) assert.deepEqual(recents.all(), [C, A, B]);
  });

  test('import() sube los de antes como más antiguos que lo que ya hay en el bucket', async () => {
    const pc = device();
    clock = 9_000;
    await pc.recents.add(A);
    assert.deepEqual(await pc.recents.import([C, B, A, 'no-es-una-pista']), [A, B, C]);
    assert.deepEqual(await pc.recents.import([]), [A, B, C]);
  });

  test('sin conexión no hay recientes', async () => {
    const offline = createRecentStore({ files: memoryFiles(), getStorage: () => null, timers: IDLE_TIMERS });
    assert.deepEqual(offline.all(), []);
    await assert.rejects(offline.add(A), /Conecta tu bucket/);
  });
});
