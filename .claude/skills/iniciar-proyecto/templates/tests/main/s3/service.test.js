import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createS3Service } from '../../../src/main/s3/service.js';
import { startFakeS3 } from '../../helpers/fakeS3.js';

/** Almacén de conexión en memoria (el real cifra en disco; se prueba en connection.test.js). */
function memoryConnections() {
  let config = null;
  return {
    async load() {},
    get: () => config,
    summary: () => (config ? { endpoint: config.endpoint, accessKeyId: config.accessKeyId, bucket: config.bucket, prefix: config.prefix } : null),
    async save(next) {
      config = next;
    },
  };
}

describe('s3/service', () => {
  let s3;
  before(async () => {
    s3 = await startFakeS3({ buckets: { musica: { 'a.mp3': 'x' } } });
  });
  after(() => s3.close());

  test('sin conexión guardada no hay cliente', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    await service.load();
    assert.equal(service.storage(), null);
    assert.equal(service.summary(), null);
  });

  test('connect() comprueba, guarda y abre el cliente; el resumen no lleva la clave secreta', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    const result = await service.connect({ ...s3.config, bucket: '' });
    assert.deepEqual(result, { ok: true, count: 1, summary: { endpoint: s3.endpoint, accessKeyId: s3.config.accessKeyId, bucket: 'musica', prefix: '' } });
    assert.equal(service.storage().bucket, 'musica');
  });

  test('connect() devuelve errores en español sin guardar nada', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    assert.deepEqual(await service.connect({ ...s3.config, accessKeyId: 'otra' }), { ok: false, error: 'Las claves no son válidas o no tienen permiso para leer el bucket' });
    assert.deepEqual(await service.connect({ ...s3.config, endpoint: 'servidor' }), { ok: false, error: 'La dirección del servidor debe empezar por https:// o http://' });
    assert.equal(service.storage(), null);
  });

  test('importCredentials() conecta con un credentials.json de MinIO', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    const json = JSON.stringify({ url: s3.endpoint, accessKey: s3.config.accessKeyId, secretKey: 'secreto', api: 's3v4', path: 'auto' });
    const result = await service.importCredentials(json);
    assert.equal(result.ok, true);
    assert.equal(result.summary.bucket, 'musica');
  });

  test('si el import no basta, devuelve el formulario sin la clave y la recuerda para el siguiente intento', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    const json = JSON.stringify({ url: s3.endpoint, accessKey: s3.config.accessKeyId, secretKey: 'secreto', bucket: 'no-existe' });

    const failed = await service.importCredentials(json);
    assert.equal(failed.ok, false);
    assert.equal(failed.error, 'Ese bucket no existe');
    assert.equal('secretAccessKey' in failed.fields, false);

    const retry = await service.connect({ ...failed.fields, bucket: 'musica', secretAccessKey: '' });
    assert.equal(retry.ok, true);
  });

  test('un archivo que no es JSON se rechaza con un mensaje claro', async () => {
    const service = createS3Service({ connections: memoryConnections() });
    assert.deepEqual(await service.importCredentials('no es json'), { ok: false, error: 'El archivo no es un credentials.json válido' });
  });
});
