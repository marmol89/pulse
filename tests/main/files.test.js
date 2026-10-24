import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNodeFiles } from '../../src/main/files.js';

let dir;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pulse-files-'));
});
after(() => rm(dir, { recursive: true, force: true }));

test('createNodeFiles() guarda por nombre relativo (con carpetas) y lee texto o bytes', async () => {
  const files = createNodeFiles(dir);
  assert.equal(await files.read('covers/a.jpg'), null);
  assert.equal(await files.readText('library.json'), null);
  assert.equal(await files.exists('covers/a.jpg'), false);

  await files.write('covers/a.jpg', Uint8Array.from([0xff, 0xd8]));
  await files.write('library.json', '{"version":1}');

  assert.deepEqual([...(await files.read('covers/a.jpg'))], [0xff, 0xd8]);
  assert.equal(await files.readText('library.json'), '{"version":1}');
  assert.equal(await files.exists('covers/a.jpg'), true);
  assert.deepEqual((await readdir(path.join(dir, 'covers'))).sort(), ['a.jpg'], 'sin temporales a medias');

  await files.remove('library.json');
  await files.remove('no-existe.json');
  assert.equal(await files.readText('library.json'), null);
});
