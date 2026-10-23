import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mediaUrl, parseMediaUrl } from '../../src/main/protocol/urls.js';
import { parseRange, mimeFor, streamFile, respondToMedia } from '../../src/main/protocol/responses.js';

describe('protocol/urls', () => {
  test('mediaUrl() y parseMediaUrl() son inversas con rutas de Windows y Linux', () => {
    for (const filePath of ['C:\\Users\\Ana\\Música\\canción #1?.mp3', '/home/ana/Música/a b%20c.flac']) {
      assert.deepEqual(parseMediaUrl(mediaUrl('track', filePath)), { kind: 'track', path: filePath });
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
  test('parseRange() interpreta rangos de inicio, intervalo y sufijo', () => {
    assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
    assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
    assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=-30', 100), { start: 70, end: 99 });
    assert.deepEqual(parseRange('bytes=-300', 100), { start: 0, end: 99 });
  });

  test('parseRange() devuelve null sin rango utilizable y false si no es satisfacible', () => {
    assert.equal(parseRange(null, 100), null);
    assert.equal(parseRange('bytes=-', 100), null);
    assert.equal(parseRange('items=0-1', 100), null);
    assert.equal(parseRange('bytes=0-1,5-6', 100), null);
    assert.equal(parseRange('bytes=100-', 100), false);
    assert.equal(parseRange('bytes=20-10', 100), false);
    assert.equal(parseRange('bytes=-0', 100), false);
  });

  test('mimeFor() conoce los formatos de audio admitidos', () => {
    assert.equal(mimeFor('/a/b.MP3'), 'audio/mpeg');
    assert.equal(mimeFor('/a/b.flac'), 'audio/flac');
    assert.equal(mimeFor('/a/b.xyz'), 'application/octet-stream');
  });

  describe('streamFile() y respondToMedia()', () => {
    let dir;
    let file;

    before(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'pulse-protocol-'));
      file = path.join(dir, 'pista.mp3');
      await writeFile(file, Buffer.from('0123456789'));
    });

    after(() => rm(dir, { recursive: true, force: true }));

    test('sin rango devuelve el archivo completo con Accept-Ranges', async () => {
      const response = await streamFile(file, null);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('accept-ranges'), 'bytes');
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(await response.text(), '0123456789');
    });

    test('con rango devuelve 206 y solo los bytes pedidos', async () => {
      const response = await streamFile(file, 'bytes=2-4');
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), 'bytes 2-4/10');
      assert.equal(response.headers.get('content-length'), '3');
      assert.equal(await response.text(), '234');
    });

    test('un rango fuera del archivo devuelve 416 y un archivo inexistente 404', async () => {
      assert.equal((await streamFile(file, 'bytes=50-')).status, 416);
      assert.equal((await streamFile(path.join(dir, 'no.mp3'), null)).status, 404);
    });

    test('respondToMedia() solo sirve rutas permitidas', async () => {
      const deps = { isAllowed: (p) => p === file, readCover: async () => null };
      assert.equal((await respondToMedia(mediaUrl('track', file), 'bytes=0-', deps)).status, 206);
      assert.equal((await respondToMedia(mediaUrl('track', path.join(dir, 'otro.mp3')), null, deps)).status, 403);
      assert.equal((await respondToMedia('media://track/', null, deps)).status, 403);
      assert.equal((await respondToMedia(mediaUrl('raro', file), null, deps)).status, 404);
    });

    test('respondToMedia() sirve la carátula o 404 si no hay', async () => {
      const png = Uint8Array.from([137, 80, 78, 71]);
      const withCover = { isAllowed: () => true, readCover: async () => ({ format: 'image/png', data: png }) };
      const response = await respondToMedia(mediaUrl('cover', file), null, withCover);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);

      const withoutCover = { isAllowed: () => true, readCover: async () => null };
      assert.equal((await respondToMedia(mediaUrl('cover', file), null, withoutCover)).status, 404);
    });
  });
});
