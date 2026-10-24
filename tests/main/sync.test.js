import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLibrarySync } from '../../src/main/library/sync.js';
import { createS3Storage } from '../../src/main/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryStore } from '../helpers/memoryStore.js';
import { createWav } from '../helpers/audio.js';

const wav = (title, artist = 'Aurora Vega') => createWav({ seconds: 0.2, tags: { title, artist } });

describe('library/sync', () => {
  let s3;
  let storage;
  let store;
  let changes;
  let clock;
  let sync;

  before(async () => {
    s3 = await startFakeS3();
  });
  after(() => s3.close());

  beforeEach(() => {
    for (const key of ['pop/a.wav', 'pop/b.wav', 'pop/c.wav', 'nueva.wav']) s3.remove('musica', key);
    s3.put('musica', 'pop/a.wav', wav('Luces de Neón'));
    s3.put('musica', 'pop/b.wav', wav('Ola Azul', 'Marea Sur'));
    s3.put('musica', 'pop/leeme.txt', 'no es audio');
    storage?.destroy();
    storage = createS3Storage(s3.config);
    store = memoryStore();
    changes = [];
    clock = { time: 0 };
    sync = createLibrarySync({ store, getStorage: () => storage, onChange: (change) => changes.push(change), now: () => clock.time });
  });

  test('la primera sincronización añade el audio del bucket con sus etiquetas', async () => {
    const { added, removed } = await sync.sync();

    assert.deepEqual(removed, []);
    assert.deepEqual(added.map((t) => [t.path, t.title, t.artist]).sort(), [
      ['s3://musica/pop/a.wav', 'Luces de Neón', 'Aurora Vega'],
      ['s3://musica/pop/b.wav', 'Ola Azul', 'Marea Sur'],
    ]);
    assert.match(added[0].url, /^media:\/\/track\/s3%3A%2F%2Fmusica%2F/);
    assert.equal(store.get('s3://musica/pop/a.wav').key, 'pop/a.wav');
    assert.equal(store.saves, 1);
    assert.equal(changes.length, 1);
  });

  test('sin cambios en el bucket no relee nada ni avisa', async () => {
    await sync.sync();
    const listed = s3.requests.length;
    await sync.sync();
    assert.equal(changes.length, 1);
    assert.equal(s3.requests.length, listed + 1, 'solo vuelve a listar');
  });

  test('añade lo nuevo, relee lo cambiado y quita lo borrado', async () => {
    await sync.sync();
    s3.put('musica', 'nueva.wav', wav('Selva', 'Kora'));
    s3.put('musica', 'pop/b.wav', wav('Ola Azul (otra mezcla)', 'Marea Sur'));
    s3.remove('musica', 'pop/a.wav');

    const { added, removed } = await sync.sync();

    assert.deepEqual(removed, ['s3://musica/pop/a.wav']);
    assert.deepEqual(added.map((t) => t.title).sort(), ['Ola Azul (otra mezcla)', 'Selva']);
    assert.equal(store.has('s3://musica/pop/a.wav'), false);
  });

  test('quita pistas de otros buckets o de la antigua biblioteca local', async () => {
    store.add([{ path: 'C:\\Música\\vieja.mp3', title: 'vieja' }, { path: 's3://otro/x.mp3', title: 'x' }]);
    const { removed } = await sync.sync();
    assert.deepEqual(removed.sort(), ['C:\\Música\\vieja.mp3', 's3://otro/x.mp3']);
  });

  test('si una canción no se puede descargar ahora, no se guarda a medias: se reintenta', async () => {
    let failures = 1;
    const flaky = createLibrarySync({
      store,
      getStorage: () => storage,
      onChange: () => {},
      readRecord: async (s3Storage, object) => {
        if (object.key === 'pop/b.wav' && failures-- > 0) throw new Error('ECONNRESET');
        const { readRemoteRecord } = await import('../../src/main/library/remote.js');
        return readRemoteRecord(s3Storage, object);
      },
    });

    const first = await flaky.sync();
    assert.deepEqual(first.added.map((t) => t.title), ['Luces de Neón']);
    assert.equal(store.has('s3://musica/pop/b.wav'), false);

    const second = await flaky.sync();
    assert.deepEqual(second.added.map((t) => t.title), ['Ola Azul']);
  });

  test('un error de red al leer etiquetas se propaga (no se confunde con "sin etiquetas")', async () => {
    const { readRemoteRecord } = await import('../../src/main/library/remote.js');
    const broken = { bucket: 'musica', readStart: async () => Promise.reject(new Error('ECONNRESET')) };
    await assert.rejects(readRemoteRecord(broken, { key: 'a.mp3', size: 10, etag: '"x"' }), /ECONNRESET/);
  });

  test('verify() confirma las que siguen y quita las borradas', async () => {
    await sync.sync();
    s3.remove('musica', 'pop/b.wav');
    assert.equal(await sync.verify('s3://musica/pop/a.wav'), true);
    assert.equal(await sync.verify('s3://musica/pop/b.wav'), false);
    assert.equal(store.has('s3://musica/pop/b.wav'), false);
    assert.equal(await sync.verify('no-es-un-id'), false);
  });

  test('syncSoon() no repite antes de 15 s; sin conexión no hace nada', async () => {
    await sync.sync();
    s3.put('musica', 'nueva.wav', wav('Selva', 'Kora'));
    clock.time = 5000;
    sync.syncSoon();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes.length, 1);

    clock.time = 20_000;
    sync.syncSoon();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(changes.length, 2);

    const disconnected = createLibrarySync({ store: memoryStore(), getStorage: () => null, onChange() {} });
    assert.deepEqual(await disconnected.sync(), { removed: [], added: [] });
  });
});
