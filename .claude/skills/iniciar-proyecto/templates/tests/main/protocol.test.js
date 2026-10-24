import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrl, parseMediaUrl } from '../../src/main/protocol/urls.js';
import { mimeFor, objectResponse, respondToMedia } from '../../src/main/protocol/responses.js';
import { createS3Storage } from '../../src/main/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';

describe('protocol/urls', () => {
  test('mediaUrl() y parseMediaUrl() son inversas con identificadores de S3', () => {
    for (const id of ['s3://musica/pop/Luis Fonsi - Despacito.mp3', 's3://musica/Tussi - Arcángel #1?.mp3', 's3://m/a b%20c.flac']) {
      assert.deepEqual(parseMediaUrl(mediaUrl('track', id)), { kind: 'track', path: id });
    }
  });

  test('parseMediaUrl() rechaza otros esquemas y URLs vacías o mal codificadas', () => {
    assert.equal(parseMediaUrl('file:///etc/passwd'), null);
    assert.equal(parseMediaUrl('media://track/'), null);
    assert.equal(parseMediaUrl('media://track/%E0%A4%A'), null);
    assert.equal(parseMediaUrl('no es una url'), null);
  });
});

describe('protocol/responses', () => {
  test('mimeFor() conoce los formatos de audio admitidos', () => {
    assert.equal(mimeFor('pop/b.MP3'), 'audio/mpeg');
    assert.equal(mimeFor('b.flac'), 'audio/flac');
    assert.equal(mimeFor('b.xyz'), 'application/octet-stream');
  });

  describe('objectResponse() y respondToMedia()', () => {
    let s3;
    let storage;
    const id = 's3://musica/pista.mp3';

    before(async () => {
      s3 = await startFakeS3({ buckets: { musica: { 'pista.mp3': '0123456789' } } });
      storage = createS3Storage(s3.config);
    });

    after(async () => {
      storage.destroy();
      await s3.close();
    });

    test('sin rango devuelve el objeto completo con su tipo y Accept-Ranges', async () => {
      const response = await objectResponse(storage, 'pista.mp3', null);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(await response.text(), '0123456789');
    });

    test('con rango devuelve 206 y solo los bytes pedidos (para poder saltar)', async () => {
      const response = await objectResponse(storage, 'pista.mp3', 'bytes=2-4');
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), 'bytes 2-4/10');
      assert.equal(response.headers.get('content-length'), '3');
      assert.equal(await response.text(), '234');
    });

    test('un rango imposible da 416, un objeto borrado 404 y un servidor caído 502', async () => {
      assert.equal((await objectResponse(storage, 'pista.mp3', 'bytes=50-')).status, 416);
      assert.equal((await objectResponse(storage, 'borrada.mp3', null)).status, 404);
      const offline = createS3Storage({ ...s3.config, endpoint: 'http://127.0.0.1:1' });
      assert.equal((await objectResponse(offline, 'pista.mp3', null)).status, 502);
      offline.destroy();
    });

    test('respondToMedia() solo sirve pistas de la biblioteca', async () => {
      const deps = { isAllowed: (p) => p === id, readCover: async () => null, openTrack: (_id, range) => objectResponse(storage, 'pista.mp3', range) };
      assert.equal((await respondToMedia(mediaUrl('track', id), 'bytes=0-', deps)).status, 206);
      assert.equal((await respondToMedia(mediaUrl('track', 's3://musica/otra.mp3'), null, deps)).status, 403);
      assert.equal((await respondToMedia('media://track/', null, deps)).status, 403);
      assert.equal((await respondToMedia(mediaUrl('raro', id), null, deps)).status, 404);
    });

    test('respondToMedia() sirve la carátula o 404 si no hay', async () => {
      const png = Uint8Array.from([137, 80, 78, 71]);
      const withCover = { isAllowed: () => true, readCover: async () => ({ format: 'image/png', data: png }) };
      const response = await respondToMedia(mediaUrl('cover', id), null, withCover);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);

      const withoutCover = { isAllowed: () => true, readCover: async () => null };
      assert.equal((await respondToMedia(mediaUrl('cover', id), null, withoutCover)).status, 404);
    });
  });
});
