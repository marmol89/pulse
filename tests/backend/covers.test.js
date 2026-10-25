import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coverFileName, createEmbeddedCovers } from '../../src/backend/library/covers.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const record = (path) => ({ path, etag: '"1"', hasCover: true });

describe('library/covers', () => {
  test('get() descarga la carátula una vez y después la sirve de covers/', async () => {
    const files = memoryFiles();
    let reads = 0;
    const covers = createEmbeddedCovers({ files, getStorage: () => ({}), read: async () => (reads++, { format: 'image/png', data: PNG }) });
    const a = record('s3://m/a.mp3');

    assert.deepEqual(await covers.get(a), { format: 'image/png', data: PNG });
    assert.ok(files.data.has(`covers/${coverFileName(a)}`));
    const again = createEmbeddedCovers({ files, getStorage: () => ({}), read: async () => (reads++, null) });
    assert.equal((await again.get(a)).format, 'image/png', 'otra sesión la lee del disco');
    assert.equal(reads, 1);
    assert.equal(await covers.get({ path: 's3://m/b.mp3' }), null, 'sin carátula incrustada no se pide');
  });

  test('save() la guarda sin descargar nada', async () => {
    const files = memoryFiles();
    const covers = createEmbeddedCovers({ files, getStorage: () => ({}), read: async () => assert.fail('no debe descargar') });
    const a = record('s3://m/a.mp3');
    assert.equal(await covers.save(a, { format: 'image/png', data: PNG }), coverFileName(a));
    assert.deepEqual((await covers.get(a)).data, PNG);
  });

  test('recuerda "no tiene carátula", pero un fallo se reintenta', async () => {
    let calls = 0;
    let fail = true;
    const covers = createEmbeddedCovers({
      files: memoryFiles(),
      getStorage: () => ({}),
      read: async (_storage, rec) => {
        calls += 1;
        if (rec.path.endsWith('vacia.mp3')) return null;
        if (fail) throw new Error('ECONNRESET');
        return { format: 'image/png', data: PNG };
      },
    });
    assert.equal(await covers.get(record('s3://m/vacia.mp3')), null);
    assert.equal(await covers.get(record('s3://m/vacia.mp3')), null);
    assert.equal(calls, 1);

    await assert.rejects(covers.get(record('s3://m/a.mp3')), /ECONNRESET/);
    fail = false;
    assert.equal((await covers.get(record('s3://m/a.mp3'))).format, 'image/png');
    await assert.rejects(createEmbeddedCovers({ files: memoryFiles(), getStorage: () => null }).get(record('s3://m/a.mp3')), /conexión/);
  });

  test('como mucho `concurrency` descargas a la vez y la misma carátula, una sola vez', async () => {
    let active = 0;
    let peak = 0;
    let reads = 0;
    const covers = createEmbeddedCovers({
      files: memoryFiles(),
      getStorage: () => ({}),
      concurrency: 2,
      read: async () => {
        reads += 1;
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { format: 'image/png', data: PNG };
      },
    });
    const paths = ['a', 'b', 'c', 'd', 'e', 'a', 'a'].map((name) => record(`s3://m/${name}.mp3`));
    const results = await Promise.all(paths.map((rec) => covers.get(rec)));
    assert.ok(results.every((result) => result.format === 'image/png'));
    assert.equal(peak, 2);
    assert.equal(reads, 5);
  });
});
