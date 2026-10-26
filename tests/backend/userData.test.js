import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadUserData, USER_DATA_KINDS } from '../../src/backend/library/userData.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const A = 's3://musica/a.mp3';
/** Temporizadores que nunca se disparan: lo pendiente solo se sube al sincronizar a mano. */
const IDLE_TIMERS = { setTimeout: () => 1, clearTimeout: () => {} };

describe('library/userData', () => {
  let s3;
  let storages = [];

  /** Un "equipo" con Pulse conectado al bucket del S3 falso. */
  async function device(files = memoryFiles()) {
    const storage = createS3Storage(s3.config);
    storages.push(storage);
    const changes = [];
    const userData = await loadUserData({ files, getStorage: () => storage, onChange: (kind, all) => changes.push([kind, all]), timers: IDLE_TIMERS });
    return { userData, changes, files };
  }

  before(async () => {
    s3 = await startFakeS3();
  });
  after(() => s3.close());
  afterEach(() => {
    for (const storage of storages) storage.destroy();
    storages = [];
  });

  test('crea y carga listas, favoritos, recientes y escuchas, con lo guardado en el equipo', async () => {
    const first = await device();
    assert.deepEqual(USER_DATA_KINDS.filter((kind) => typeof first.userData[kind]?.load !== 'function'), []);
    await first.userData.favorites.set(A, true);
    const again = await device(first.files);
    assert.deepEqual(again.userData.favorites.all(), [A]);
  });

  test('flush() sube lo pendiente de todos y luego no queda nada', async () => {
    const { userData } = await device();
    assert.equal(userData.hasPending(), false);
    await userData.favorites.set(A, true);
    await userData.plays.add(A);
    assert.equal(userData.hasPending(), true);
    await userData.flush();
    assert.equal(userData.hasPending(), false);

    const other = await device();
    await other.userData.sync();
    assert.deepEqual(other.userData.favorites.all(), [A]);
    assert.deepEqual(other.userData.plays.all(), { [A]: 1 });
    assert.deepEqual(
      other.changes.map(([kind]) => kind).sort(),
      ['favorites', 'plays'],
      'cada cambio llega con el nombre de lo que cambió',
    );
  });
});
