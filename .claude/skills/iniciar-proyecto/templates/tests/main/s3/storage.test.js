import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createS3Storage, describeS3Error } from '../../../src/main/s3/storage.js';
import { startFakeS3 } from '../../helpers/fakeS3.js';

describe('s3/storage', () => {
  let s3;
  before(async () => {
    s3 = await startFakeS3({
      pageSize: 2,
      buckets: {
        musica: {
          'pop/Luis Fonsi - Despacito.mp3': '0123456789',
          'pop/portada.jpg': 'img',
          'rock/Queen - Bohemian Rhapsody.flac': 'abcdef',
          'rock/notas.txt': 'x',
          'rock/Kora - Selva.ogg': 'zz',
        },
      },
    });
  });
  after(() => s3.close());

  test('lista solo el audio del bucket, recorriendo todas las páginas', async () => {
    const storage = createS3Storage(s3.config);
    const objects = await storage.listAudio();
    assert.deepEqual(objects.map((o) => o.key).sort(), ['pop/Luis Fonsi - Despacito.mp3', 'rock/Kora - Selva.ogg', 'rock/Queen - Bohemian Rhapsody.flac']);
    assert.equal(objects.find((o) => o.key.endsWith('.mp3')).size, 10);
    assert.match(objects[0].etag, /^"[0-9a-f]{32}"$/);
    storage.destroy();
  });

  test('respeta el prefijo', async () => {
    const storage = createS3Storage({ ...s3.config, prefix: 'rock/' });
    assert.equal((await storage.listAudio()).length, 2);
    storage.destroy();
  });

  test('lee el principio de un objeto y lo sirve por rangos', async () => {
    const storage = createS3Storage(s3.config);
    assert.equal(Buffer.from(await storage.readStart('pop/Luis Fonsi - Despacito.mp3', 4)).toString(), '0123');

    const partial = await storage.getObject('pop/Luis Fonsi - Despacito.mp3', 'bytes=2-4');
    assert.equal(partial.status, 206);
    assert.equal(partial.contentRange, 'bytes 2-4/10');
    assert.equal(await new Response(partial.body).text(), '234');

    const full = await storage.getObject('pop/Luis Fonsi - Despacito.mp3', null);
    assert.equal(full.status, 200);
    assert.equal(full.contentLength, 10);
    storage.destroy();
  });

  test('exists() distingue objetos presentes y borrados', async () => {
    const storage = createS3Storage(s3.config);
    assert.equal(await storage.exists('rock/Kora - Selva.ogg'), true);
    assert.equal(await storage.exists('rock/no-esta.ogg'), false);
    storage.destroy();
  });

  test('listBuckets() y errores en español (claves incorrectas, bucket inexistente, sin servidor)', async () => {
    const storage = createS3Storage(s3.config);
    assert.deepEqual(await storage.listBuckets(), ['musica']);

    const wrongKey = createS3Storage({ ...s3.config, accessKeyId: 'otra' });
    const keyError = await wrongKey.listAudio().catch((error) => error);
    assert.equal(describeS3Error(keyError), 'Las claves no son válidas o no tienen permiso para leer el bucket');

    const noBucket = createS3Storage({ ...s3.config, bucket: 'no-existe' });
    assert.equal(describeS3Error(await noBucket.listAudio().catch((error) => error)), 'Ese bucket no existe');

    const offline = createS3Storage({ ...s3.config, endpoint: 'http://127.0.0.1:1' });
    assert.equal(describeS3Error(await offline.listAudio().catch((error) => error)), 'No se pudo conectar con el servidor');
    for (const client of [storage, wrongKey, noBucket, offline]) client.destroy();
  });
});
