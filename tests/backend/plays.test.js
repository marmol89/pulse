import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayStore, deviceId, playResult, PLAYS_FILE } from '../../src/backend/library/plays.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const REMOTE = 'metadatos/escuchas.json';
const A = 's3://musica/a.mp3';
const B = 's3://musica/b.mp3';
/** Temporizadores que nunca se disparan: cada test sincroniza a mano y no quedan reintentos vivos. */
const IDLE_TIMERS = { setTimeout: () => 1, clearTimeout: () => {} };

describe('library/plays', () => {
  let s3;
  let storages;
  let clock;

  /** Un "equipo" con Pulse: su id, sus archivos, su reloj y su conexión al mismo bucket. */
  function device(id, { files = memoryFiles(), changes = [] } = {}) {
    const storage = createS3Storage(s3.config);
    storages.push(storage);
    const plays = createPlayStore({ device: id, files, getStorage: () => storage, onChange: (all) => changes.push(all), now: () => clock, minInterval: 0, timers: IDLE_TIMERS });
    return { plays, files, changes, storage };
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

  test('cuenta las escuchas de cada canción y las guarda en este equipo', async () => {
    const { plays, files } = device('pc');
    await plays.add(A);
    await plays.add(B);
    assert.deepEqual((await plays.add(A)).plays, { [A]: 2, [B]: 1 });
    assert.deepEqual(plays.all(), { [A]: 2, [B]: 1 });
    assert.equal(JSON.parse(files.text(PLAYS_FILE)).plays.length, 2);
    assert.deepEqual(await playResult(() => plays.add('/disco/a.mp3')), { ok: false, error: 'Esa canción no está en tu biblioteca' });
  });

  test('dos equipos que escuchan a la vez no se pisan: el total es la suma', async () => {
    const pc = device('pc');
    const phone = device('movil');
    await pc.plays.add(A);
    await pc.plays.add(A);
    await pc.plays.sync();
    await phone.plays.add(A); // aún sin haber traído las del pc
    await phone.plays.add(B);
    await phone.plays.sync();
    await pc.plays.sync();

    assert.deepEqual(pc.plays.all(), { [A]: 3, [B]: 1 });
    assert.deepEqual(phone.plays.all(), { [A]: 3, [B]: 1 });
    assert.deepEqual(pc.changes.at(-1), { [A]: 3, [B]: 1 }, 'avisa con los totales');

    clock += 10;
    await pc.plays.add(A);
    await pc.plays.sync();
    await phone.plays.sync();
    assert.equal(phone.plays.all()[A], 4);
  });

  test('deviceId() se crea una vez y se recuerda', async () => {
    const files = memoryFiles();
    let n = 0;
    const random = () => `id-${(n += 1)}`;
    assert.equal(await deviceId(files, { random }), 'id-1');
    assert.equal(await deviceId(files, { random }), 'id-1');
    assert.equal(await deviceId(memoryFiles(), { random }), 'id-2');
  });
});
