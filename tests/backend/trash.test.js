import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTrash } from '../../src/backend/library/trash.js';
import { createLibraryStore } from '../../src/backend/library/store.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const id = (key) => `s3://musica/${key}`;

describe('library/trash', () => {
  let s3;
  let storage;
  let store;
  let removed;
  let restored;
  let trash;

  beforeEach(async () => {
    s3 = await startFakeS3({ buckets: { musica: { 'Pulse/Disco/Selva.mp3': 'selva', 'Pulse/Notas.flac': 'notas', 'Otro/Fuera.mp3': 'x' } } });
    storage = createS3Storage({ ...s3.config, prefix: 'Pulse/' });
    store = createLibraryStore(memoryFiles());
    store.add(['Pulse/Disco/Selva.mp3', 'Pulse/Notas.flac', 'Otro/Fuera.mp3'].map((key) => ({ path: id(key), key })));
    removed = [];
    restored = 0;
    trash = createTrash({ getStorage: () => storage, store, onRemoved: (ids) => removed.push(...ids), afterRestore: async () => (restored += 1) });
  });
  afterEach(async () => {
    storage.destroy();
    await s3.close();
  });

  test('eliminar mueve la canción a papelera/ (con su carpeta) y la quita de la biblioteca', async () => {
    assert.deepEqual(await trash.move(id('Pulse/Disco/Selva.mp3')), { ok: true, removed: [id('Pulse/Disco/Selva.mp3')] });
    assert.deepEqual(s3.keys('musica'), ['Otro/Fuera.mp3', 'Pulse/Notas.flac', 'Pulse/papelera/Disco/Selva.mp3']);
    assert.equal(s3.get('musica', 'Pulse/papelera/Disco/Selva.mp3').toString(), 'selva');
    assert.equal(store.has(id('Pulse/Disco/Selva.mp3')), false);
    assert.deepEqual(removed, [id('Pulse/Disco/Selva.mp3')]);
    assert.deepEqual((await storage.listAudio()).map((object) => object.key), ['Pulse/Notas.flac'], 'la biblioteca no ve la papelera');
  });

  test('en la papelera nunca se pisa nada: la segunda con ese nombre es "(2)"', async () => {
    await trash.move(id('Pulse/Notas.flac'));
    s3.put('musica', 'Pulse/Notas.flac', 'otras notas');
    store.add([{ path: id('Pulse/Notas.flac'), key: 'Pulse/Notas.flac' }]);
    await trash.move(id('Pulse/Notas.flac'));
    const { items } = await trash.list();
    assert.deepEqual(items.map((item) => item.name).sort(), ['Notas (2).flac', 'Notas.flac']);
  });

  test('restaurar la devuelve a su sitio y sincroniza; si ya hay otra con ese nombre, "(2)"', async () => {
    await trash.move(id('Pulse/Disco/Selva.mp3'));
    const result = await trash.restore('Pulse/papelera/Disco/Selva.mp3');
    assert.deepEqual(result, { ok: true, items: [] });
    assert.equal(s3.get('musica', 'Pulse/Disco/Selva.mp3').toString(), 'selva');
    assert.equal(restored, 1);

    await trash.move(id('Pulse/Notas.flac'));
    s3.put('musica', 'Pulse/Notas.flac', 'una nueva con el mismo nombre');
    await trash.restore('Pulse/papelera/Notas.flac');
    assert.equal(s3.get('musica', 'Pulse/Notas (2).flac').toString(), 'notas');
    assert.equal(s3.get('musica', 'Pulse/Notas.flac').toString(), 'una nueva con el mismo nombre');
  });

  test('vaciar la papelera borra para siempre solo lo que hay en ella', async () => {
    await trash.move(id('Pulse/Disco/Selva.mp3'));
    await trash.move(id('Pulse/Notas.flac'));
    assert.deepEqual(await trash.empty(), { ok: true, removed: 2, items: [] });
    assert.deepEqual(s3.keys('musica'), ['Otro/Fuera.mp3']);
  });

  test('no toca nada fuera de la carpeta de la conexión ni lo que no está en la biblioteca', async () => {
    assert.equal((await trash.move(id('Otro/Fuera.mp3'))).ok, false);
    assert.equal((await trash.move(id('Pulse/No-existe.mp3'))).ok, false);
    assert.equal((await trash.restore('Pulse/Notas.flac')).ok, false, 'solo restaura desde la papelera');
    assert.deepEqual(s3.keys('musica'), ['Otro/Fuera.mp3', 'Pulse/Disco/Selva.mp3', 'Pulse/Notas.flac']);
  });

  test('sin permiso de escritura o sin conexión lo explica y la canción sigue en la biblioteca', async () => {
    s3.setReadOnly(true);
    assert.deepEqual(await trash.move(id('Pulse/Notas.flac')), { ok: false, error: 'Tus claves no tienen permiso para eliminar ni restaurar canciones en este bucket' });
    assert.equal(store.has(id('Pulse/Notas.flac')), true);
    assert.ok(s3.get('musica', 'Pulse/Notas.flac'));
    const offline = createTrash({ getStorage: () => null, store });
    assert.equal((await offline.list()).ok, false);
  });
});
