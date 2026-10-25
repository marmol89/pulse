import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, bytesToBase64, createNativeFetch, nativeRequest } from '../../src/android/nativeHttp.js';
import { coverFileName, createCoverCache, fingerprint } from '../../src/android/covers.js';

/** CapacitorHttp de mentira que devuelve lo que se le indique y apunta lo que recibe. */
function stubHttp(reply) {
  const calls = [];
  return { calls, request: async (options) => (calls.push(options), reply(options)) };
}

test('base64 de ida y vuelta, también con datos grandes', () => {
  const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  assert.deepEqual(base64ToBytes('AAEC\n/w=='), Uint8Array.from([0, 1, 2, 255]));
});

test('nativeRequest() envía el cuerpo en base64 con Content-Type y entiende cada forma de respuesta', async () => {
  const http = stubHttp(({ method }) =>
    method === 'PUT' ? { status: 200, headers: { ETag: '"x"' }, data: '' } : method === 'HEAD' ? { status: 404, headers: {}, data: 'Not Found' } : { status: 200, headers: { 'Content-Type': 'application/json' }, data: { ok: true } },
  );
  const put = await nativeRequest(http, { url: 'https://s3.test/b/k', method: 'PUT', body: Uint8Array.from([1, 2]) });
  assert.deepEqual(http.calls[0], { url: 'https://s3.test/b/k', method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, responseType: 'arraybuffer', data: 'AQI=', dataType: 'file' });
  assert.deepEqual(put.headers, { etag: '"x"' }, 'cabeceras en minúscula');

  assert.deepEqual((await nativeRequest(http, { url: 'https://s3.test/b/k', method: 'HEAD' })).body, new Uint8Array());
  const json = await nativeRequest(http, { url: 'https://s3.test/x' });
  assert.equal(new TextDecoder().decode(json.body), '{"ok":true}', 'el JSON ya interpretado vuelve a bytes');
});

test('nativeRequest() manda el JSON como texto: el plugin no decodifica el base64 de application/json', async () => {
  const http = stubHttp(() => ({ status: 200, headers: {}, data: '' }));
  const text = '{"lists":["ñ"]}';
  await nativeRequest(http, { url: 'https://s3.test/b/listas.json', method: 'PUT', headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode(text) });
  assert.equal(http.calls[0].data, text);
  assert.equal(http.calls[0].dataType, undefined);
});

test('createNativeFetch() da Responses normales: binario, error en texto y sin cuerpo', async () => {
  const replies = {
    'https://img.test/a.jpg': { status: 200, headers: { 'content-type': 'image/jpeg' }, data: '/9j/' },
    'https://api.test/caida': { status: 503, headers: { 'content-type': 'text/plain' }, data: 'Servicio no disponible' },
    'https://api.test/vacia': { status: 204, headers: {}, data: '' },
  };
  const fetch = createNativeFetch(stubHttp(({ url }) => replies[url]));

  const image = await fetch('https://img.test/a.jpg');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), Uint8Array.from([0xff, 0xd8, 0xff]));
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  const down = await fetch('https://api.test/caida');
  assert.equal(down.status, 503);
  assert.equal(await down.text(), 'Servicio no disponible');
  assert.equal((await fetch('https://api.test/vacia')).status, 204);
  await assert.rejects(fetch('https://api.test/vacia', { signal: AbortSignal.abort() }));
});

test('coverFileName(): la incrustada por pista y versión; la de internet, por su nombre', () => {
  assert.equal(fingerprint('a'), fingerprint('a'));
  assert.notEqual(fingerprint('s3://m/a.mp3#"1"'), fingerprint('s3://m/a.mp3#"2"'));
  assert.match(coverFileName({ path: 's3://m/a.mp3', etag: '"1"', hasCover: true }), /^embedded-[0-9a-f]{16}\.jpg$/);
  assert.equal(coverFileName({ path: 's3://m/a.mp3', coverName: 'abc.jpg' }), 'abc.jpg');
  assert.equal(coverFileName({ path: 's3://m/a.mp3' }), null);
});

test('createCoverCache(): pide una vez cada carátula que falta, no reintenta las que fallan y avisa juntas', async () => {
  const written = new Map();
  const files = { list: async () => ['abc.jpg', 'x.tmp'], write: async (name, data) => written.set(name, data) };
  const records = {
    a: { path: 'a', hasCover: true, etag: '1' },
    b: { path: 'b', coverName: 'abc.jpg' },
    c: { path: 'c', coverName: 'falta.jpg' },
  };
  const ready = [];
  let reads = 0;
  const cache = createCoverCache({
    files,
    toUrl: (name) => `file:${name}`,
    readEmbedded: async () => (reads++, { data: Uint8Array.from([1]) }),
    readCover: async () => null,
    getRecord: (id) => records[id],
    onReady: (ids) => ready.push(ids),
    timers: { setTimeout: (task) => setImmediate(task), clearTimeout() {} },
  });
  await cache.load();

  assert.equal(cache.url(records.b), 'file:abc.jpg');
  assert.equal(cache.url(records.a), null);
  assert.equal(cache.url(records.a), null, 'ya pedida');
  assert.equal(cache.url(records.c), null);
  await cache.idle();

  assert.equal(reads, 1);
  assert.deepEqual([...written.keys()], [`covers/${coverFileName(records.a)}`]);
  assert.deepEqual(ready, [['a']]);
  assert.match(cache.url(records.a), /^file:embedded-/);
  assert.equal(cache.url(records.c), null, 'la que falló no se vuelve a pedir');
  await cache.idle();
  assert.equal(ready.length, 1);
});

test('createCoverCache(): un fallo de red no cuenta como "no la tiene" y se vuelve a pedir', async () => {
  const record = { path: 'a', hasCover: true, etag: '1' };
  let fail = true;
  let reads = 0;
  const cache = createCoverCache({
    files: { list: async () => [], write: async () => {} },
    toUrl: (name) => `file:${name}`,
    readEmbedded: async () => {
      reads += 1;
      if (fail) throw new Error('ECONNRESET');
      return { data: Uint8Array.from([1]) };
    },
    readCover: async () => null,
    getRecord: () => record,
    onReady: () => {},
    timers: { setTimeout: (task) => setImmediate(task), clearTimeout() {} },
  });
  await cache.load();
  assert.equal(cache.url(record), null);
  await cache.idle();
  fail = false;
  assert.equal(cache.url(record), null, 'se pide otra vez');
  await cache.idle();
  assert.equal(reads, 2);
  assert.match(cache.url(record), /^file:embedded-/);
});
