import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSourceService, FOLDERS_FILE } from '../../src/backend/source.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

const BUCKET = { endpoint: 'https://minio.ejemplo.com', accessKeyId: 'clave', bucket: 'musica', prefix: '' };
const MUSIC = { id: '/home/ana/Música', name: '/home/ana/Música' };
const USB = { id: '/media/usb', name: '/media/usb' };

/** Servicio S3 falso: conecta si la clave secreta es "bien". */
function fakeS3({ connected = false } = {}) {
  let summary = connected ? BUCKET : null;
  const storage = { bucket: 'musica', prefix: '' };
  return {
    async load() {},
    storage: () => (summary ? storage : null),
    summary: () => summary,
    async connect(input) {
      if (input.secretAccessKey !== 'bien') return { ok: false, error: 'Las claves no son válidas' };
      summary = BUCKET;
      return { ok: true, summary, count: 3 };
    },
    importCredentials: async () => ({ ok: true, summary: BUCKET, count: 3 }),
  };
}

/** Storage de carpetas falso: una canción por carpeta; "/media/usb" no se puede leer si `unplugged`. */
function folderStorages({ unplugged = false } = {}) {
  const created = [];
  const create = (folders) => {
    const storage = {
      folders,
      readOnly: true,
      destroyed: false,
      async listAudio() {
        if (unplugged && folders.some((folder) => folder.id === USB.id)) throw new TypeError('No se encuentra la carpeta «/media/usb»');
        return folders.map((folder) => ({ key: `${folder.id}/a.mp3` }));
      },
      destroy() {
        this.destroyed = true;
      },
    };
    created.push(storage);
    return storage;
  };
  return { create, created };
}

async function service({ files = memoryFiles(), s3 = fakeS3(), storages = folderStorages(), released = [] } = {}) {
  const source = createSourceService({ s3, files, createFolderStorage: storages.create, release: async (folder) => released.push(folder.id) });
  await source.load();
  return source;
}

describe('backend/source', () => {
  test('sin bucket ni carpetas no hay música ni resumen', async () => {
    const source = await service();
    assert.equal(source.storage(), null);
    assert.equal(source.summary(), null);
  });

  test('con el bucket conectado, la música sale de él', async () => {
    const source = await service({ s3: fakeS3({ connected: true }) });
    assert.equal(source.storage().bucket, 'musica');
    assert.deepEqual(source.summary(), { mode: 's3', ...BUCKET, folders: [] });
  });

  test('solo usa carpetas elegidas en el selector o ya guardadas, y las comprueba antes', async () => {
    const files = memoryFiles();
    const storages = folderStorages();
    const source = await service({ files, storages });
    assert.deepEqual(await source.useFolders(['C:/']), { ok: false, error: 'Añade al menos una carpeta con música' }, 'una que no eligió el usuario');
    assert.equal(source.storage(), null);

    assert.deepEqual(source.offer(MUSIC), MUSIC);
    assert.equal(source.offer({ id: '' }), null);
    const result = await source.useFolders([MUSIC.id, MUSIC.id, 'C:/']);
    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.deepEqual(result.summary, { mode: 'local', folders: [MUSIC] });
    assert.deepEqual(source.storage().folders, [MUSIC]);
    assert.equal(storages.created[0].destroyed, true, 'la de la comprobación no se queda abierta');
    assert.deepEqual(JSON.parse(files.text(FOLDERS_FILE)), { version: 1, active: true, folders: [MUSIC] });

    const again = await service({ files });
    assert.equal(again.summary().mode, 'local', 'se recuerdan al volver a abrir');
    assert.equal((await again.useFolders([MUSIC.id])).ok, true, 'las guardadas se pueden volver a usar sin elegirlas');
  });

  test('si una carpeta no se puede leer no cambia nada', async () => {
    const source = await service({ s3: fakeS3({ connected: true }), storages: folderStorages({ unplugged: true }) });
    source.offer(USB);
    assert.deepEqual(await source.useFolders([USB.id]), { ok: false, error: 'No se encuentra la carpeta «/media/usb»' });
    assert.equal(source.summary().mode, 's3');
  });

  test('quitar una carpeta devuelve su permiso; el bucket y las carpetas nunca van a la vez', async () => {
    const released = [];
    const source = await service({ released });
    source.offer(MUSIC);
    source.offer(USB);
    await source.useFolders([MUSIC.id, USB.id]);
    await source.useFolders([MUSIC.id]);
    assert.deepEqual(released, [USB.id]);

    assert.equal((await source.connect({ secretAccessKey: 'mal' })).ok, false);
    assert.equal(source.summary().mode, 'local', 'si el bucket no conecta, se sigue con las carpetas');
    const connected = await source.connect({ secretAccessKey: 'bien' });
    assert.deepEqual(connected.summary, { mode: 's3', ...BUCKET, folders: [MUSIC] }, 'las carpetas siguen guardadas para volver');
    assert.equal(source.storage().bucket, 'musica');

    await source.useFolders([MUSIC.id]);
    assert.equal(source.storage().readOnly, true);
    assert.equal((await source.importCredentials('{}')).summary.mode, 's3');
  });
});
