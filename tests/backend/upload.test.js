import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertAbsolutePaths, collectUploads, createUploader } from '../../src/backend/library/upload.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';

describe('library/upload', () => {
  let s3;
  let dir;
  let storage;

  before(async () => {
    s3 = await startFakeS3();
    dir = await mkdtemp(path.join(tmpdir(), 'pulse-upload-'));
    await mkdir(path.join(dir, 'Disco', 'CD 2'), { recursive: true });
    await writeFile(path.join(dir, 'Selva.mp3'), 'selva');
    await writeFile(path.join(dir, 'notas.txt'), 'no es audio');
    await writeFile(path.join(dir, 'Disco', '01 Intro.flac'), 'intro');
    await writeFile(path.join(dir, 'Disco', 'portada.jpg'), 'img');
    await writeFile(path.join(dir, 'Disco', 'CD 2', '10 Final.ogg'), 'final');
  });
  after(async () => {
    await s3.close();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    for (const key of ['Selva.mp3', 'Selva (2).mp3', 'subidas/Selva.mp3', 'Disco/01 Intro.flac', 'Disco/CD 2/10 Final.ogg']) s3.remove('musica', key);
    storage?.destroy();
    storage = createS3Storage(s3.config);
  });

  test('solo acepta rutas absolutas', () => {
    assert.throws(() => assertAbsolutePaths(['relativa.mp3']), TypeError);
    assert.throws(() => assertAbsolutePaths('C:/x.mp3'), TypeError);
    assertAbsolutePaths([path.join(dir, 'Selva.mp3')]);
  });

  test('recoge el audio de archivos y carpetas, con la carpeta en el nombre', async () => {
    const files = await collectUploads([path.join(dir, 'Selva.mp3'), path.join(dir, 'notas.txt'), path.join(dir, 'Disco'), path.join(dir, 'no-existe.mp3')]);
    assert.deepEqual(
      files.map((f) => [f.name, f.size]),
      [
        ['Disco/01 Intro.flac', 5],
        ['Disco/CD 2/10 Final.ogg', 5],
        ['Selva.mp3', 5],
      ],
    );
  });

  test('sube al bucket, informa del progreso y sincroniza al terminar', async () => {
    const progress = [];
    let synced = 0;
    const uploader = createUploader({ getStorage: () => storage, onProgress: (p) => progress.push(p), afterUpload: async () => (synced += 1) });

    const result = await uploader.upload([path.join(dir, 'Selva.mp3'), path.join(dir, 'Disco')]);

    assert.deepEqual(result, { ok: true, total: 3, uploaded: 3, skipped: 0, failed: [] });
    assert.equal(s3.get('musica', 'Disco/CD 2/10 Final.ogg').toString(), 'final');
    assert.deepEqual(progress.map((p) => `${p.current}/${p.total} ${p.name}`), ['1/3 01 Intro.flac', '2/3 10 Final.ogg', '3/3 Selva.mp3']);
    assert.equal(synced, 1);
  });

  test('respeta la carpeta de la conexión', async () => {
    const prefixed = createS3Storage({ ...s3.config, prefix: 'subidas/' });
    await createUploader({ getStorage: () => prefixed }).upload([path.join(dir, 'Selva.mp3')]);
    assert.equal(s3.get('musica', 'subidas/Selva.mp3').toString(), 'selva');
    prefixed.destroy();
  });

  test('nunca sobrescribe: el mismo archivo se salta y otro con el mismo nombre se renombra', async () => {
    let synced = 0;
    const uploader = createUploader({ getStorage: () => storage, afterUpload: async () => (synced += 1) });
    s3.put('musica', 'Selva.mp3', 'selva'); // ya subido (mismo tamaño)
    assert.deepEqual(await uploader.upload([path.join(dir, 'Selva.mp3')]), { ok: true, total: 1, uploaded: 0, skipped: 1, failed: [] });
    assert.equal(synced, 0, 'sin subidas no hace falta sincronizar');

    s3.put('musica', 'Selva.mp3', 'otra canción distinta');
    await uploader.upload([path.join(dir, 'Selva.mp3')]);
    assert.equal(s3.get('musica', 'Selva.mp3').toString(), 'otra canción distinta');
    assert.equal(s3.get('musica', 'Selva (2).mp3').toString(), 'selva');
  });

  test('sin permiso de escritura cuenta los fallos con un mensaje claro', async () => {
    s3.setReadOnly(true);
    try {
      const result = await createUploader({ getStorage: () => storage }).upload([path.join(dir, 'Selva.mp3')]);
      assert.equal(result.uploaded, 0);
      assert.deepEqual(result.failed, [{ name: 'Selva.mp3', error: 'Tus claves no tienen permiso para subir canciones a este bucket' }]);
    } finally {
      s3.setReadOnly(false);
    }
  });

  test('sin conexión pide conectar; las subidas a la vez van en fila', async () => {
    assert.deepEqual(await createUploader({ getStorage: () => null }).upload([]), {
      ok: false,
      needsConnection: true,
      error: 'Conecta tu bucket antes de subir canciones',
    });

    const order = [];
    const slow = {
      prefix: '',
      stat: async () => null,
      upload: async (key) => {
        order.push(`empieza ${key}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push(`termina ${key}`);
      },
    };
    const uploader = createUploader({ getStorage: () => slow, openFile: () => Buffer.alloc(0) });
    await Promise.all([uploader.upload([path.join(dir, 'Selva.mp3')]), uploader.upload([path.join(dir, 'Disco', '01 Intro.flac')])]);
    assert.deepEqual(order, ['empieza Selva.mp3', 'termina Selva.mp3', 'empieza 01 Intro.flac', 'termina 01 Intro.flac']);
  });
});
