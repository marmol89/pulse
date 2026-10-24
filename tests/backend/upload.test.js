import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createUploader } from '../../src/backend/library/upload.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';

/** Lo que entrega el `collect` de Android: archivos ya elegidos, sin rutas del disco. */
const picked = (files) => async () => files.map(([name, text]) => ({ name, size: new TextEncoder().encode(text).length, open: () => new TextEncoder().encode(text) }));

describe('library/upload (sin disco)', () => {
  let s3;
  let storage;
  before(async () => {
    s3 = await startFakeS3();
    storage = createS3Storage(s3.config);
  });
  after(async () => {
    storage.destroy();
    await s3.close();
  });

  test('sube lo que da `collect` (bytes) y salta lo que ya está', async () => {
    const uploader = createUploader({ getStorage: () => storage, collect: picked([['Móvil/Selva.mp3', 'selva'], ['Notas.flac', 'notas']]) });

    assert.deepEqual(await uploader.upload(), { ok: true, total: 2, uploaded: 2, skipped: 0, failed: [] });
    assert.equal(s3.get('musica', 'Móvil/Selva.mp3').toString(), 'selva');
    assert.equal(s3.get('musica', 'Notas.flac').toString(), 'notas');
    assert.deepEqual(await uploader.upload(), { ok: true, total: 2, uploaded: 0, skipped: 2, failed: [] });
  });
});
