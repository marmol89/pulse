import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConnectionStore, normalizeConfig, parseCredentials, resolveConnection } from '../../../src/main/s3/connection.js';
import { createS3Storage } from '../../../src/main/s3/storage.js';
import { startFakeS3 } from '../../helpers/fakeS3.js';

/** "Cifrado" reversible y visible para comprobar que la clave no se guarda en claro. */
const fakeCrypto = {
  encrypt: async (text) => `cifrado:${Buffer.from(text).toString('base64')}`,
  decrypt: async (text) => ({ text: Buffer.from(text.slice(8), 'base64').toString() }),
};
const valid = { endpoint: 'https://minio.ejemplo.com/', accessKeyId: ' clave ', secretAccessKey: 'secreto', bucket: 'musica', prefix: '/pop/' };

describe('s3/connection', () => {
  let dir;
  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pulse-s3-'));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('guarda la conexión con la clave secreta cifrada y la recupera', async () => {
    const file = path.join(dir, 's3.json');
    const store = createConnectionStore(file, fakeCrypto);
    await store.save(normalizeConfig(valid));

    const onDisk = await readFile(file, 'utf8');
    assert.equal(onDisk.includes('secreto'), false, 'la clave secreta no se guarda en claro');

    const reopened = createConnectionStore(file, fakeCrypto);
    await reopened.load();
    assert.deepEqual(reopened.get(), { endpoint: 'https://minio.ejemplo.com', accessKeyId: 'clave', secretAccessKey: 'secreto', bucket: 'musica', prefix: 'pop/' });
    assert.deepEqual(reopened.summary(), { endpoint: 'https://minio.ejemplo.com', accessKeyId: 'clave', bucket: 'musica', prefix: 'pop/' });

    await reopened.clear();
    assert.equal(reopened.summary(), null);
  });

  test('si el sistema cambió su clave, vuelve a cifrar el secreto al cargar', async () => {
    const file = path.join(dir, 'rotada.json');
    await createConnectionStore(file, { ...fakeCrypto, encrypt: async (text) => `antiguo:${Buffer.from(text).toString('base64')}` }).save(normalizeConfig(valid));
    const rotated = createConnectionStore(file, { ...fakeCrypto, decrypt: async (text) => ({ ...(await fakeCrypto.decrypt(text)), reencrypt: true }) });

    await rotated.load();

    assert.equal(rotated.get().secretAccessKey, 'secreto');
    assert.match(JSON.parse(await readFile(file, 'utf8')).secretAccessKey, /^cifrado:/);
  });

  test('sin conexión guardada no hay resumen', async () => {
    const store = createConnectionStore(path.join(dir, 'no-existe.json'), fakeCrypto);
    await store.load();
    assert.equal(store.get(), null);
  });

  test('normalizeConfig() valida y conserva la clave secreta si no se reescribe', () => {
    assert.throws(() => normalizeConfig({ ...valid, endpoint: 'minio.ejemplo.com' }), /https:\/\//);
    assert.throws(() => normalizeConfig({ ...valid, accessKeyId: '' }), /clave de acceso/);
    assert.throws(() => normalizeConfig({ ...valid, secretAccessKey: '' }), /clave secreta/);
    const saved = normalizeConfig(valid);
    assert.equal(normalizeConfig({ ...valid, secretAccessKey: '' }, saved).secretAccessKey, 'secreto');
    assert.throws(() => normalizeConfig({ ...valid, accessKeyId: 'otra', secretAccessKey: '' }, saved), /clave secreta/);
  });

  test('parseCredentials() entiende el formato de MinIO y el de AWS', () => {
    assert.deepEqual(parseCredentials('{"url":"https://api-minio.ejemplo.com","accessKey":"A","secretKey":"S","api":"s3v4","path":"auto"}'), {
      endpoint: 'https://api-minio.ejemplo.com',
      accessKeyId: 'A',
      secretAccessKey: 'S',
      bucket: '',
      prefix: '',
    });
    assert.equal(parseCredentials({ endpoint: 'https://s3.amazonaws.com', accessKeyId: 'A', secretAccessKey: 'S', bucket: 'b' }).bucket, 'b');
  });

  describe('resolveConnection()', () => {
    let s3;
    before(async () => {
      s3 = await startFakeS3({ buckets: { musica: { 'a.mp3': 'x', 'b.flac': 'y', 'leeme.txt': 'z' } } });
    });
    after(() => s3.close());

    test('sin bucket usa el único que hay y cuenta las canciones', async () => {
      const { config, count } = await resolveConnection({ ...s3.config, bucket: '' }, createS3Storage);
      assert.equal(config.bucket, 'musica');
      assert.equal(count, 2);
    });

    test('propaga los errores de acceso para mostrarlos', async () => {
      await assert.rejects(resolveConnection({ ...s3.config, accessKeyId: 'otra' }, createS3Storage), (error) => error.Code === 'InvalidAccessKeyId' || error.name === 'InvalidAccessKeyId');
    });
  });
});
