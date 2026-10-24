import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMetadataStore, lookupStamp } from '../../src/main/library/metadata.js';
import { createS3Storage } from '../../src/main/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);

describe('library/metadata', () => {
  let s3;
  let dir;
  let storage;
  let records;
  let metadata;

  before(async () => {
    s3 = await startFakeS3();
    dir = await mkdtemp(path.join(tmpdir(), 'pulse-metadata-'));
  });
  after(async () => {
    await s3.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    for (const key of ['metadatos/biblioteca.json', 'metadatos/caratulas/abc.jpg', 'pop/metadatos/biblioteca.json']) s3.remove('musica', key);
    storage?.destroy();
    storage = createS3Storage(s3.config);
    records = [
      { path: 's3://musica/a.mp3', title: 'Tussi', coverName: 'abc.jpg', online: { checkedAt: 5 } },
      { path: 's3://otro/b.mp3', title: 'De otro bucket' },
    ];
    await rm(path.join(dir, 'covers'), { recursive: true, force: true });
    await mkdir(path.join(dir, 'covers'), { recursive: true });
    await writeFile(path.join(dir, 'covers', 'abc.jpg'), JPEG);
    metadata = createMetadataStore({ getStorage: () => storage, getRecords: () => records, coversDir: path.join(dir, 'covers'), delay: 10, maxWait: 50 });
  });

  test('sube biblioteca.json (solo este bucket) y las carátulas a metadatos/', async () => {
    await metadata.flush();
    const saved = JSON.parse(s3.get('musica', 'metadatos/biblioteca.json').toString());
    assert.deepEqual(saved, { version: 1, tracks: [records[0]] });
    assert.deepEqual(s3.get('musica', 'metadatos/caratulas/abc.jpg'), JPEG);
  });

  test('pull() lee lo guardado; sin metadatos devuelve []', async () => {
    assert.deepEqual(await metadata.pull(), []);
    await metadata.flush();
    assert.deepEqual(await metadata.pull(), [records[0]]);
  });

  test('con la carpeta de la conexión, metadatos/ va dentro de ella', async () => {
    const prefixed = createS3Storage({ ...s3.config, prefix: 'pop/' });
    const inFolder = createMetadataStore({ getStorage: () => prefixed, getRecords: () => records, coversDir: path.join(dir, 'covers') });
    await inFolder.flush();
    assert.ok(s3.get('musica', 'pop/metadatos/biblioteca.json'));
    prefixed.destroy();
  });

  test('schedulePush() agrupa guardados seguidos en una subida', async () => {
    const puts = () => s3.requests.filter((r) => r.method === 'PUT' && r.path.endsWith('biblioteca.json')).length;
    const before = puts();
    metadata.schedulePush();
    metadata.schedulePush();
    assert.equal(metadata.hasPending(), true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await metadata.flush();
    assert.equal(metadata.hasPending(), false);
    assert.equal(puts() - before, 1, 'una sola subida; sin cambios no vuelve a subir');
  });

  test('una carátula que falta en este equipo se descarga del bucket y queda en la caché', async () => {
    await metadata.flush();
    await rm(path.join(dir, 'covers', 'abc.jpg'));
    assert.deepEqual(await metadata.readCover('abc.jpg'), JPEG);
    assert.deepEqual(await readFile(path.join(dir, 'covers', 'abc.jpg')), JPEG);
    assert.equal(await metadata.readCover('no-existe.jpg'), null);
  });

  test('sin permiso de escritura avisa una vez y no rompe nada', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    s3.setReadOnly(true);
    try {
      await metadata.flush();
      records = [...records, { path: 's3://musica/c.mp3' }];
      await metadata.flush();
    } finally {
      s3.setReadOnly(false);
    }
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /no tienen permiso para subir.*(AccessDenied 403)/);
    assert.equal(metadata.hasPending(), true, 'se reintentará');
    await metadata.flush();
    assert.ok(s3.get('musica', 'metadatos/biblioteca.json'), 'al volver el permiso, se sube');
  });

  test('sin conexión no hace nada', async () => {
    const offline = createMetadataStore({ getStorage: () => null, getRecords: () => records, coversDir: dir });
    assert.deepEqual(await offline.pull(), []);
    await offline.flush();
    assert.equal(await offline.readCover('x.jpg'), null);
  });

  test('lookupStamp() es la búsqueda en internet más reciente', () => {
    assert.equal(lookupStamp({ online: { checkedAt: 5, lyricsCheckedAt: 9 } }), 9);
    assert.equal(lookupStamp({}), 0);
  });
});
