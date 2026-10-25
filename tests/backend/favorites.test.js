import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFavoriteStore, favoriteResult, FAVORITES_FILE } from '../../src/backend/library/favorites.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const REMOTE = 'metadatos/favoritos.json';
const A = 's3://musica/a.mp3';
const B = 's3://musica/b.mp3';
const C = 's3://musica/c.mp3';
/** Temporizadores que nunca se disparan: cada test sincroniza a mano y no quedan reintentos vivos. */
const IDLE_TIMERS = { setTimeout: () => 1, clearTimeout: () => {} };

describe('library/favorites', () => {
  let s3;
  let storages;
  let clock;

  /** Un "equipo" con Pulse: sus archivos, su reloj y su conexión al mismo bucket. */
  function device({ files = memoryFiles(), storage = createS3Storage(s3.config), changes = [] } = {}) {
    storages.push(storage);
    const favorites = createFavoriteStore({
      files,
      getStorage: () => storage,
      onChange: (all) => changes.push(all),
      now: () => clock,
      minInterval: 0,
      timers: IDLE_TIMERS,
    });
    return { favorites, files, changes, storage };
  }

  before(async () => {
    s3 = await startFakeS3();
  });
  after(() => s3.close());
  beforeEach(() => {
    s3.remove('musica', REMOTE);
    s3.setReadOnly(false);
    storages = [];
    clock = 1_000;
  });
  afterEach(() => {
    for (const storage of storages) storage.destroy();
  });

  test('marca y desmarca; las más recientes primero y la desmarcada queda como marca', async () => {
    const { favorites, files } = device();
    await favorites.set(A, true);
    clock = 2_000;
    assert.deepEqual(await favorites.set(B, true), [B, A]);
    assert.deepEqual(await favorites.set(B, true), [B, A], 'marcarla otra vez no cambia nada');
    assert.deepEqual(await favorites.set(A, false), [B]);
    assert.equal(JSON.parse(files.text(FAVORITES_FILE)).favorites.find((record) => record.id === A).deleted, true);
    clock = 3_000;
    assert.deepEqual(await favorites.set(A, true), [A, B], 'volver a marcarla la pone la primera');
  });

  test('rechaza lo que no es una canción del bucket y, sin conexión, no hay favoritos', async () => {
    const { favorites } = device();
    await assert.rejects(favorites.set('/disco/a.mp3', true), /no está en tu bucket/);
    const offline = createFavoriteStore({ files: memoryFiles(), getStorage: () => null, timers: IDLE_TIMERS });
    assert.deepEqual(offline.all(), []);
    await assert.rejects(offline.set(A, true), /Conecta tu bucket/);
  });

  test('se suben a metadatos/favoritos.json y otro equipo los recibe al sincronizar', async () => {
    const pc = device();
    const phone = device();
    await pc.favorites.set(A, true);
    await pc.favorites.sync();
    assert.equal(JSON.parse(s3.get('musica', REMOTE).toString()).favorites[0].id, A);

    await phone.favorites.sync();
    assert.deepEqual(phone.favorites.all(), [A]);
    assert.deepEqual(phone.changes, [[A]], 'avisa del cambio');
    await phone.favorites.sync();
    assert.equal(phone.changes.length, 1, 'sin cambios no vuelve a avisar');
  });

  test('una desmarcada en un equipo no vuelve con la copia del otro; gana el cambio más reciente', async () => {
    const pc = device();
    const phone = device();
    await pc.favorites.set(A, true);
    await pc.favorites.set(B, true);
    await pc.favorites.sync();
    await phone.favorites.sync();

    clock = 2_000;
    await phone.favorites.set(A, false);
    clock = 3_000;
    await pc.favorites.set(C, true);
    await phone.favorites.sync();
    await pc.favorites.sync();
    await phone.favorites.sync();

    for (const { favorites } of [pc, phone]) assert.deepEqual(favorites.all(), [C, B]);
  });

  test('import() sube los de antes (solo de este equipo) en su orden, sin tocar los que ya decidió el bucket', async () => {
    const pc = device();
    await pc.favorites.set(A, true);
    await pc.favorites.set(B, true);
    await pc.favorites.set(B, false);
    await pc.favorites.sync();

    const phone = device();
    await phone.favorites.sync();
    clock = 5_000;
    assert.deepEqual(await phone.favorites.import([C, B, A, 'no-es-una-pista']), [C, A], 'B se desmarcó en el bucket y A ya estaba');
    assert.deepEqual(await phone.favorites.import([]), [C, A]);
  });

  test('si no se puede leer el bucket, no se pisan los favoritos de los demás', async () => {
    const pc = device();
    await pc.favorites.set(A, true);
    await pc.favorites.sync();
    const wrongKey = device({ storage: createS3Storage({ ...s3.config, accessKeyId: 'otra-clave' }) });
    await wrongKey.favorites.set(B, true);
    await wrongKey.favorites.sync();
    assert.deepEqual(JSON.parse(s3.get('musica', REMOTE).toString()).favorites.map((record) => record.id), [A]);
    assert.equal(wrongKey.favorites.hasPending(), true, 'queda un reintento programado');
  });

  test('load() recupera los guardados en este equipo', async () => {
    const first = device();
    await first.favorites.set(A, true);
    const again = device({ files: first.files, storage: first.storage });
    await again.favorites.load();
    assert.deepEqual(again.favorites.all(), [A]);
  });
});

describe('favoriteResult', () => {
  test('devuelve { ok, favorites } o, con un error del usuario, { ok: false, error }', async () => {
    assert.deepEqual(await favoriteResult(async () => [A]), { ok: true, favorites: [A] });
    assert.deepEqual(await favoriteResult(async () => { throw new TypeError('Conecta tu bucket para guardar favoritos'); }), { ok: false, error: 'Conecta tu bucket para guardar favoritos' });
  });
});
