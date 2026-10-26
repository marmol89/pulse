import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFolderStorage, parseRange } from '../../src/main/library/folderStorage.js';
import { createLibrarySync } from '../../src/backend/library/sync.js';
import { objectResponse, respondToMedia } from '../../src/main/protocol/responses.js';
import { mediaTrack, mediaUrl } from '../../src/main/protocol/urls.js';
import { memoryStore } from '../helpers/memoryStore.js';
import { createWav } from '../helpers/audio.js';

const slash = (file) => file.split(path.sep).join('/');

describe('main/library/folderStorage', () => {
  let dir;
  let music;
  let other;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pulse-carpetas-'));
    music = path.join(dir, 'Música');
    other = path.join(dir, 'Otra');
    await mkdir(path.join(music, 'Disco'), { recursive: true });
    await mkdir(path.join(music, '.oculta'), { recursive: true });
    await mkdir(other, { recursive: true });
    await writeFile(path.join(music, 'Disco', '01.wav'), createWav({ seconds: 0.2, tags: { title: 'Luces de Neón', artist: 'Aurora Vega' } }));
    await writeFile(path.join(music, 'suelta.wav'), createWav({ seconds: 0.2 }));
    await writeFile(path.join(music, 'leeme.txt'), 'no es audio');
    await writeFile(path.join(music, '.oculta', 'x.wav'), createWav({ seconds: 0.1 }));
    await writeFile(path.join(other, 'fuera.wav'), createWav({ seconds: 0.1 }));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('lista el audio de las carpetas (sin ocultas ni repetidas) con tamaño, versión y fecha', async () => {
    const storage = createFolderStorage([{ id: music, name: 'Música' }, { id: path.join(music, 'Disco'), name: 'Disco' }]);
    const objects = await storage.listAudio();
    assert.deepEqual(objects.map((object) => object.key).sort(), [slash(path.join(music, 'Disco', '01.wav')), slash(path.join(music, 'suelta.wav'))]);
    for (const object of objects) {
      assert.ok(object.size > 0);
      assert.match(object.etag, /^\d+-\d+$/);
      assert.ok(object.lastModified > 0);
    }
    assert.equal(storage.readOnly, true);
    assert.equal(storage.scheme, 'local');
  });

  test('una carpeta que ya no está da un error claro', async () => {
    const storage = createFolderStorage([{ id: path.join(dir, 'no-existe'), name: 'USB' }]);
    await assert.rejects(storage.listAudio(), (error) => error instanceof TypeError && error.message === 'No se encuentra la carpeta «USB»');
  });

  test('solo lee archivos de audio de dentro de sus carpetas y nunca escribe', async () => {
    const storage = createFolderStorage([{ id: music, name: 'Música' }]);
    const key = slash(path.join(music, 'suelta.wav'));
    assert.equal(new TextDecoder().decode(await storage.readStart(key, 4)), 'RIFF');
    assert.ok((await storage.stat(key)).size > 0);
    assert.equal(await storage.exists(slash(path.join(music, 'borrada.wav'))), false);
    await assert.rejects(storage.readStart(slash(path.join(other, 'fuera.wav')), 4), { name: 'NoSuchKey' });
    await assert.rejects(storage.readStart(slash(path.join(music, 'leeme.txt')), 4), { name: 'NoSuchKey' });
    await assert.rejects(storage.readStart(`${slash(music)}/../Otra/fuera.wav`, 4), { name: 'NoSuchKey' });
    assert.equal(await storage.read('metadatos/biblioteca.json'), null);
    await assert.rejects(storage.upload(key, new Uint8Array(1), { size: 1 }), TypeError);
    await assert.rejects(storage.remove(key), TypeError);
  });

  test('parseRange entiende los rangos del <audio> y rechaza los imposibles', () => {
    assert.equal(parseRange(null, 100), null);
    assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
    assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
    assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.throws(() => parseRange('bytes=100-', 100), { name: 'InvalidRange' });
    assert.throws(() => parseRange('bytes=-', 100), { name: 'InvalidRange' });
    assert.throws(() => parseRange('items=0-1', 100), { name: 'InvalidRange' });
  });

  test('se sincroniza como un bucket y media:// sirve el audio con rangos', async () => {
    const storage = createFolderStorage([{ id: music, name: 'Música' }]);
    const store = memoryStore();
    const sync = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: () => {} });
    const { added } = await sync.sync();
    const id = `local://carpetas/${slash(path.join(music, 'Disco', '01.wav'))}`;
    const track = added.find((item) => item.path === id);
    assert.equal(track.title, 'Luces de Neón');
    assert.equal(added.find((item) => item.path.endsWith('suelta.wav')).title, 'suelta', 'sin etiquetas, el nombre del archivo');

    const deps = { isAllowed: (target) => store.has(target), readCover: async () => null, openTrack: (target, range) => objectResponse(storage, store.get(target).key, range) };
    const whole = await respondToMedia(mediaUrl('track', id), null, deps);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('content-type'), 'audio/wav');
    const size = Number(whole.headers.get('content-length'));
    await whole.arrayBuffer();
    const part = await respondToMedia(mediaUrl('track', id), 'bytes=4-7', deps);
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-7/${size}`);
    const part2 = await respondToMedia(mediaUrl('track', id), 'bytes=8-11', deps);
    assert.equal(new TextDecoder().decode(await part2.arrayBuffer()), 'WAVE');
    assert.equal((await part.arrayBuffer()).byteLength, 4);
    assert.equal((await respondToMedia(mediaUrl('track', id), `bytes=${size}-`, deps)).status, 416);
    assert.equal((await respondToMedia(mediaUrl('track', `local://carpetas/${slash(path.join(other, 'fuera.wav'))}`), null, deps)).status, 403);
  });
});
