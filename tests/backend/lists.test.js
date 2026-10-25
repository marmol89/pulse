import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createListStore, mergeLists, listResult, LISTS_FILE } from '../../src/backend/library/lists.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const REMOTE = 'metadatos/listas.json';
const A = 's3://musica/a.mp3';
const B = 's3://musica/b.mp3';
/** Temporizadores que nunca se disparan: cada test sincroniza a mano y no quedan reintentos vivos. */
const IDLE_TIMERS = { setTimeout: () => 1, clearTimeout: () => {} };

describe('library/lists', () => {
  let s3;
  let storages;
  let clock;
  let ids;

  /** Un "equipo" con Pulse: sus archivos, su reloj y su conexión al mismo bucket. */
  function device({ files = memoryFiles(), storage = createS3Storage(s3.config), changes = [] } = {}) {
    storages.push(storage);
    const lists = createListStore({
      files,
      getStorage: () => storage,
      onChange: (all) => changes.push(all),
      now: () => clock,
      newId: () => `lista-${++ids}`,
      minInterval: 0,
      timers: IDLE_TIMERS,
    });
    return { lists, files, changes, storage };
  }

  before(async () => {
    s3 = await startFakeS3();
  });
  after(() => s3.close());
  beforeEach(() => {
    s3.remove('musica', REMOTE);
    s3.remove('musica', `pop/${REMOTE}`);
    s3.setReadOnly(false);
    storages = [];
    clock = 1_000;
    ids = 0;
  });
  afterEach(() => {
    for (const storage of storages) storage.destroy();
  });

  test('crea, añade sin repetir, quita, renombra y borra; todo queda en este equipo', async () => {
    const { lists, files } = device();
    const { id } = await lists.create('  Para correr  ', [A, A, 'no-es-una-pista']);
    assert.deepEqual(lists.all().map(({ name, tracks }) => ({ name, tracks })), [{ name: 'Para correr', tracks: [A] }]);
    await lists.add(id, [A, B]);
    await lists.removeTrack(id, A);
    const renamed = await lists.rename(id, 'Correr');
    assert.deepEqual(renamed.map(({ name, tracks }) => ({ name, tracks })), [{ name: 'Correr', tracks: [B] }]);
    assert.deepEqual(await lists.remove(id), []);
    assert.equal(JSON.parse(files.text(LISTS_FILE)).lists[0].deleted, true, 'queda la marca de borrada');
  });

  test('rechaza nombres vacíos y listas que no existen', async () => {
    const { lists } = device();
    await assert.rejects(lists.create('   '), /nombre/);
    await assert.rejects(lists.add('no-existe', [A]), /ya no existe/);
  });

  test('sin conexión no hay listas', async () => {
    const lists = createListStore({ files: memoryFiles(), getStorage: () => null, timers: IDLE_TIMERS });
    assert.deepEqual(lists.all(), []);
    await assert.rejects(lists.create('Sin bucket'), /Conecta tu bucket/);
  });

  test('se sube a metadatos/listas.json y otro equipo la recibe al sincronizar', async () => {
    const pc = device();
    const phone = device();
    await pc.lists.create('Para correr', [A]);
    await pc.lists.sync();
    assert.equal(JSON.parse(s3.get('musica', REMOTE).toString()).lists[0].name, 'Para correr');

    await phone.lists.sync();
    assert.deepEqual(phone.lists.all().map((list) => list.name), ['Para correr']);
    assert.equal(phone.changes.length, 1, 'avisa del cambio');
    await phone.lists.sync();
    assert.equal(phone.changes.length, 1, 'sin cambios no vuelve a avisar');
  });

  test('los cambios de dos equipos se juntan: gana la edición más reciente de cada lista', async () => {
    const pc = device();
    const phone = device();
    const { id } = await pc.lists.create('Compartida', [A]);
    await pc.lists.sync();
    await phone.lists.sync();

    clock = 2_000;
    await pc.lists.rename(id, 'Del PC');
    clock = 3_000;
    await phone.lists.add(id, [B]); // más reciente: gana entera
    await phone.lists.create('Solo del móvil');
    await pc.lists.sync();
    await phone.lists.sync();
    await pc.lists.sync();

    for (const { lists } of [pc, phone]) {
      assert.deepEqual(lists.all().map(({ name, tracks }) => ({ name, tracks })), [
        { name: 'Compartida', tracks: [A, B] },
        { name: 'Solo del móvil', tracks: [] },
      ]);
    }
  });

  test('una lista borrada en un equipo no resucita con la copia del otro', async () => {
    const pc = device();
    const phone = device();
    const { id } = await pc.lists.create('Temporal', [A]);
    await pc.lists.sync();
    await phone.lists.sync();
    clock = 2_000;
    await phone.lists.remove(id);
    await phone.lists.sync();
    await pc.lists.sync();
    assert.deepEqual(pc.lists.all(), []);
  });

  test('cada cambio se sube solo poco después', async () => {
    const storage = createS3Storage(s3.config);
    storages.push(storage);
    const lists = createListStore({ files: memoryFiles(), getStorage: () => storage, delay: 5 });
    await lists.create('Automática');
    assert.equal(lists.hasPending(), true);
    while (lists.hasPending()) await new Promise((resolve) => setTimeout(resolve, 5));
    await lists.sync(); // espera a la que está en marcha
    assert.equal(JSON.parse(s3.get('musica', REMOTE).toString()).lists[0].name, 'Automática');
  });

  test('si el bucket no deja escribir, la lista sigue en este equipo y se reintenta', async () => {
    s3.setReadOnly(true);
    const { lists } = device();
    await lists.create('Sin permiso', [A]);
    await lists.sync();
    assert.equal(s3.get('musica', REMOTE), undefined);
    assert.equal(lists.hasPending(), true, 'queda un reintento programado');
    s3.setReadOnly(false);
    await lists.sync();
    assert.ok(s3.get('musica', REMOTE));
  });

  test('si no se puede leer el bucket, no se pisan las listas de los demás', async () => {
    const pc = device();
    await pc.lists.create('Del PC');
    await pc.lists.sync();
    const wrongKey = device({ storage: createS3Storage({ ...s3.config, accessKeyId: 'otra-clave' }) });
    await wrongKey.lists.create('No debe subir');
    await wrongKey.lists.sync();
    assert.deepEqual(JSON.parse(s3.get('musica', REMOTE).toString()).lists.map((list) => list.name), ['Del PC']);
  });

  test('las listas son de la carpeta de la conexión; al cambiar de conexión no se mezclan', async () => {
    const files = memoryFiles();
    let storage = createS3Storage(s3.config);
    storages.push(storage);
    const changes = [];
    const lists = createListStore({ files, getStorage: () => storage, onChange: (all) => changes.push(all), timers: IDLE_TIMERS });
    await lists.create('De la raíz');
    await lists.sync();
    storage = createS3Storage({ ...s3.config, prefix: 'pop/' });
    storages.push(storage);
    assert.deepEqual(lists.all(), []);
    await lists.sync();
    assert.deepEqual(changes, [[]], 'avisa de que las de la conexión anterior ya no están');
    await lists.create('De pop');
    await lists.sync();
    assert.equal(JSON.parse(s3.get('musica', `pop/${REMOTE}`).toString()).lists[0].name, 'De pop');
    assert.equal(JSON.parse(s3.get('musica', REMOTE).toString()).lists[0].name, 'De la raíz');
  });

  test('load() recupera las guardadas en este equipo', async () => {
    const first = device();
    await first.lists.create('Guardada', [A]);
    const again = device({ files: first.files, storage: first.storage });
    await again.lists.load();
    assert.deepEqual(again.lists.all().map((list) => list.name), ['Guardada']);
  });
});

describe('mergeLists', () => {
  test('por cada lista gana la de updatedAt mayor; empate, la primera copia', () => {
    const a = [{ id: '1', name: 'a', tracks: [], createdAt: 1, updatedAt: 5 }];
    const b = [
      { id: '1', name: 'b', tracks: [], createdAt: 1, updatedAt: 5 },
      { id: '2', name: 'nueva', tracks: [], createdAt: 0, updatedAt: 1 },
    ];
    assert.deepEqual(mergeLists(a, b).map((list) => list.name), ['nueva', 'a']);
    assert.equal(mergeLists(a, [{ ...b[0], updatedAt: 6 }])[0].name, 'b');
  });
});

describe('listResult', () => {
  test('devuelve { ok, lists, id? } o, con un error del usuario, { ok: false, error }', async () => {
    assert.deepEqual(await listResult(async () => []), { ok: true, lists: [] });
    assert.deepEqual(await listResult(async () => ({ id: '1', lists: [] })), { ok: true, id: '1', lists: [] });
    assert.deepEqual(await listResult(async () => { throw new TypeError('Ponle un nombre a la lista'); }), { ok: false, error: 'Ponle un nombre a la lista' });
    await assert.rejects(listResult(async () => { throw new Error('fallo interno'); }), /fallo interno/);
  });
});
