import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importPaths, assertAbsolutePaths } from '../../src/main/library/importer.js';
import { createLibraryStore } from '../../src/main/library/store.js';
import { createWav } from '../helpers/audio.js';

describe('library/importer', () => {
  let dir;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pulse-import-'));
    await mkdir(path.join(dir, 'musica'));
    await writeFile(path.join(dir, 'musica', 'a.wav'), createWav({ seconds: 0.2, tags: { title: 'A' } }));
    await writeFile(path.join(dir, 'musica', 'b.wav'), createWav({ seconds: 0.2, tags: { title: 'B' } }));
  });

  after(() => rm(dir, { recursive: true, force: true }));

  test('importa una carpeta, guarda la biblioteca y devuelve pistas con URLs media://', async () => {
    const store = createLibraryStore(path.join(dir, 'library.json'));

    const tracks = await importPaths(store, [path.join(dir, 'musica')]);

    assert.deepEqual(tracks.map((t) => t.title), ['A', 'B']);
    assert.match(tracks[0].url, /^media:\/\/track\//);
    assert.equal(store.has(path.join(dir, 'musica', 'a.wav')), true);

    const reopened = createLibraryStore(path.join(dir, 'library.json'));
    await reopened.load();
    assert.equal(reopened.all().length, 2);
  });

  test('volver a importar lo mismo no duplica ni devuelve nada', async () => {
    const store = createLibraryStore(path.join(dir, 'library.json'));
    await store.load();
    assert.deepEqual(await importPaths(store, [path.join(dir, 'musica')]), []);
  });

  test('rechaza rutas relativas o que no son texto', async () => {
    assert.throws(() => assertAbsolutePaths(['relativa/a.mp3']), TypeError);
    assert.throws(() => assertAbsolutePaths('no-es-lista'), TypeError);
    await assert.rejects(importPaths(createLibraryStore(path.join(dir, 'x.json')), [42]), TypeError);
  });
});
