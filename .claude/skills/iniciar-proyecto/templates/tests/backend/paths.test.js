import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { basename, extname, coverFile } from '../../src/backend/paths.js';

test('basename() y extname() se comportan como path.posix y aceptan "\\" de Windows', () => {
  for (const name of ['pop/a b.mp3', 'a.mp3', 'Disco/01.Intro.flac', '.oculto', 'sin-extension', 'carpeta/']) {
    assert.equal(basename(name), path.posix.basename(name), name);
    assert.equal(extname(name), path.posix.extname(name), name);
  }
  assert.equal(basename('C:\\Música\\a.mp3'), 'a.mp3');
  assert.equal(basename('pop/Tussi - Arcángel.mp3', '.mp3'), 'Tussi - Arcángel');
  assert.equal(basename('.mp3', '.mp3'), '.mp3');
});

test('coverFile() nunca sale de covers/', () => {
  assert.equal(coverFile('abc.jpg'), 'covers/abc.jpg');
  assert.equal(coverFile('../../s3.json'), 'covers/s3.json');
});
