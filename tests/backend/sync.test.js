import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLibrarySync } from '../../src/backend/library/sync.js';
import { mediaTrack } from '../../src/main/protocol/urls.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
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
    sync = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: (change) => changes.push(change), now: () => clock.time });
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
    const flaky = createLibrarySync({ toTrack: mediaTrack,
      store,
      getStorage: () => storage,
      onChange: () => {},
      readRecord: async (s3Storage, object) => {
        if (object.key === 'pop/b.wav' && failures-- > 0) throw new Error('ECONNRESET');
        const { readRemoteRecord } = await import('../../src/backend/library/remote.js');
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
    const { readRemoteRecord } = await import('../../src/backend/library/remote.js');
    const broken = { bucket: 'musica', readStart: async () => Promise.reject(new Error('ECONNRESET')) };
    await assert.rejects(readRemoteRecord(broken, { key: 'a.mp3', size: 10, etag: '"x"' }), /ECONNRESET/);
  });

  test('con los metadatos del bucket no relee los archivos que no han cambiado (otro equipo, primera vez)', async () => {
    await sync.sync();
    const fromOtherPc = store.all().map((record) => ({ ...record, album: 'Neón', online: { checkedAt: 7, status: 'found' } }));
    s3.put('musica', 'pop/b.wav', wav('Ola Azul (otra mezcla)', 'Marea Sur')); // b cambió después: su metadato ya no vale
    const reads = [];
    const fresh = createLibrarySync({ toTrack: mediaTrack,
      store: memoryStore(),
      getStorage: () => storage,
      onChange: (change) => changes.push(change),
      pullMetadata: async () => fromOtherPc,
      readRecord: async (s3Storage, object) => {
        reads.push(object.key);
        const { readRemoteRecord } = await import('../../src/backend/library/remote.js');
        return readRemoteRecord(s3Storage, object);
      },
    });

    const { added } = await fresh.sync();

    assert.deepEqual(reads, ['pop/b.wav'], 'solo se lee el que cambió');
    assert.deepEqual(added.map((t) => [t.title, t.album]).sort(), [
      ['Luces de Neón', 'Neón'],
      ['Ola Azul (otra mezcla)', ''],
    ]);
  });

  test('datos de internet más recientes en el bucket llegan como pistas actualizadas', async () => {
    await sync.sync();
    const local = store.get('s3://musica/pop/a.wav');
    store.add([{ ...local, online: { checkedAt: 5, status: 'not-found' } }, { ...store.get('s3://musica/pop/b.wav'), online: { checkedAt: 3, status: 'not-found' } }]);
    const remote = [
      { ...local, album: 'Neón', online: { checkedAt: 9, status: 'found' } },
      { ...store.get('s3://musica/pop/b.wav'), album: 'Antiguo', online: { checkedAt: 1 } }, // más antiguo: se ignora
      { path: 's3://musica/ya-no-esta.wav', etag: '"x"' }, // borrado del bucket: se ignora
    ];
    const updated = [];
    const withMetadata = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: (change) => changes.push(change), onUpdated: (tracks) => updated.push(tracks), pullMetadata: async () => remote });
    const saves = store.saves;

    const change = await withMetadata.sync();

    assert.deepEqual(change, { removed: [], added: [] });
    assert.deepEqual(updated.map((tracks) => tracks.map((t) => t.album)), [['Neón']]);
    assert.equal(store.get('s3://musica/pop/a.wav').album, 'Neón');
    assert.equal(store.get('s3://musica/pop/b.wav').album, '');
    assert.equal(store.saves, saves + 1);
  });

  test('cada pista lleva la fecha de subida del bucket; a las de antes se les pone sin releerlas', async () => {
    s3.put('musica', 'pop/a.wav', wav('Luces de Neón'), new Date('2026-03-01T10:00:00Z'));
    await sync.sync();
    assert.equal(store.get('s3://musica/pop/a.wav').addedAt, Date.parse('2026-03-01T10:00:00Z'));

    const { addedAt, ...older } = store.get('s3://musica/pop/b.wav'); // guardada por una versión sin fechas
    store.add([older]);
    const updated = [];
    const reads = [];
    const again = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: (change) => changes.push(change), onUpdated: (tracks) => updated.push(tracks), readRecord: async (_, object) => reads.push(object.key) });

    await again.sync();

    assert.deepEqual(reads, []);
    assert.equal(store.get('s3://musica/pop/b.wav').addedAt, addedAt);
    assert.deepEqual(updated.map((tracks) => tracks.map((t) => [t.title, t.addedAt])), [[['Ola Azul', addedAt]]]);
  });

  test('las leídas con una versión anterior de las etiquetas se releen una vez, sin perder sus datos de internet', async () => {
    s3.put('musica', 'pop/a.wav', createWav({ seconds: 0.2, tags: { title: 'Luces de Neón', artist: 'Aurora Vega', trackGain: '-7.25 dB' } }));
    await sync.sync();
    const { tagsVersion, replayGain, ...older } = store.get('s3://musica/pop/a.wav'); // guardada antes de leer ReplayGain
    assert.deepEqual(replayGain, { track: -7.25, album: null });
    store.add([{ ...older, album: 'Neón', online: { checkedAt: 4, status: 'found' } }]);
    const updated = [];
    const again = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: (change) => changes.push(change), onUpdated: (tracks) => updated.push(tracks) });

    const change = await again.sync();

    assert.deepEqual(change, { removed: [], added: [] }, 'no es una canción nueva');
    assert.deepEqual(updated.map((tracks) => tracks.map((t) => [t.album, t.replayGain])), [[['Neón', { track: -7.25, album: null }]]]);
    assert.equal(store.get('s3://musica/pop/a.wav').online.checkedAt, 4);
    const listed = s3.requests.length;
    await again.sync();
    assert.equal(s3.requests.length, listed + 1, 'ya no se vuelve a releer');
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

    const disconnected = createLibrarySync({ toTrack: mediaTrack, store: memoryStore(), getStorage: () => null, onChange() {} });
    assert.deepEqual(await disconnected.sync(), { removed: [], added: [] });
  });

  test('si cambia el origen con una sincronización en marcha, no devuelve esa: sincroniza con el nuevo detrás', async () => {
    let release;
    const stuck = { bucket: 'musica', prefix: '', listAudio: () => new Promise((resolve, reject) => (release = () => reject(new Error('sin red')))) };
    const folders = { bucket: 'carpetas', prefix: '', scheme: 'local', readOnly: true, listAudio: async () => [] };
    let current = stuck;
    const switching = createLibrarySync({ toTrack: mediaTrack, store: memoryStore(), getStorage: () => current, onChange() {} });
    const first = switching.sync();
    assert.equal(switching.sync(), first, 'con el mismo storage, la misma');
    current = folders;
    const second = switching.sync();
    assert.notEqual(second, first);
    await new Promise((resolve) => setImmediate(resolve)); // que la primera llegue a listar
    release();
    await assert.rejects(first, /sin red/);
    assert.deepEqual(await second, { removed: [], added: [] });
  });
});
