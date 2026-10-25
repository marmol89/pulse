import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDownloads } from '../../src/android/downloads.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const record = (id, etag = '"1"', size = 100) => ({ path: `s3://musica/${id}.mp3`, key: `${id}.mp3`, etag, size });

function setup({ records = [record('a'), record('b')], files = memoryFiles(), fail = new Set() } = {}) {
  const byId = new Map(records.map((item) => [item.path, item]));
  const downloaded = [];
  const changes = [];
  const downloads = createDownloads({
    files,
    signedUrl: async (item) => `https://s3/${item.key}?firmada`,
    download: async (url, path) => {
      if (fail.has(url)) throw new Error('sin red');
      downloaded.push([url, path]);
      await files.write(path, new Uint8Array([1, 2, 3]));
    },
    getRecord: (id) => byId.get(id) ?? null,
    toUrl: (path) => `http://localhost/_capacitor_file_/datos/${path}`,
    onChange: (summary) => changes.push(summary),
  });
  return { downloads, downloaded, changes, files, byId };
}

describe('android/downloads', () => {
  test('descarga de una en una desde la URL firmada y la canción pasa a sonar del móvil', async () => {
    const { downloads, downloaded, changes, byId } = setup();
    const first = downloads.add(['s3://musica/a.mp3', 's3://musica/b.mp3', 's3://musica/no-existe.mp3']);
    assert.deepEqual(first.pending, ['s3://musica/a.mp3', 's3://musica/b.mp3']);

    await downloads.idle();

    assert.deepEqual(downloaded.map(([url]) => url), ['https://s3/a.mp3?firmada', 'https://s3/b.mp3?firmada']);
    assert.match(downloaded[0][1], /^downloads\/[0-9a-f]{16}\.mp3$/);
    assert.equal(downloads.urlFor(byId.get('s3://musica/a.mp3')), `http://localhost/_capacitor_file_/datos/${downloaded[0][1]}`);
    assert.deepEqual(changes.at(-1), { paths: ['s3://musica/a.mp3', 's3://musica/b.mp3'], pending: [], bytes: 200 });
    assert.equal(changes.length, 2, 'avisa al terminar cada una');
  });

  test('se recuerda en downloads.json; si cambió en el bucket (otro ETag) vuelve a sonar desde S3', async () => {
    const files = memoryFiles();
    const first = setup({ files });
    first.downloads.add(['s3://musica/a.mp3']);
    await first.downloads.idle();

    const again = setup({ files, records: [record('a', '"2"')] });
    await again.downloads.load();
    assert.equal(again.downloads.urlFor(again.byId.get('s3://musica/a.mp3')), null);
    assert.deepEqual(again.downloads.summary().paths, []);
    again.downloads.add(['s3://musica/a.mp3']);
    await again.downloads.idle();
    assert.ok(again.downloads.urlFor(again.byId.get('s3://musica/a.mp3')));
    assert.equal(await files.exists(first.downloaded[0][1]), false, 'la versión antigua se borra');
  });

  test('quitar y borrar todo eliminan los archivos', async () => {
    const { downloads, downloaded, files } = setup();
    downloads.add(['s3://musica/a.mp3', 's3://musica/b.mp3']);
    await downloads.idle();

    assert.deepEqual((await downloads.remove(['s3://musica/a.mp3'])).paths, ['s3://musica/b.mp3']);
    assert.equal(await files.exists(downloaded[0][1]), false);
    assert.deepEqual(await downloads.clear(), { paths: [], pending: [], bytes: 0 });
    assert.equal(await files.exists(downloaded[1][1]), false);
  });

  test('si una falla (sin red), no se apunta y sigue con las demás', async () => {
    const { downloads } = setup({ fail: new Set(['https://s3/a.mp3?firmada']) });
    downloads.add(['s3://musica/a.mp3', 's3://musica/b.mp3']);
    await downloads.idle();
    assert.deepEqual(downloads.summary().paths, ['s3://musica/b.mp3']);
  });
});
