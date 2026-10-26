import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TAGS_VERSION, isAudioFile, baseRecord, readRecordCover, toTrack } from '../../src/backend/library/tracks.js';
import { mediaTrack } from '../../src/main/protocol/urls.js';
import { trackId, isTrackId, parseTrackId, id3Size, readRemoteRecord, readRemoteCover } from '../../src/backend/library/remote.js';
import { createLibraryStore } from '../../src/backend/library/store.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { createWav } from '../helpers/audio.js';
import { encodePng, paint } from '../../scripts/lib/png.js';
import { memoryFiles } from '../helpers/memoryFiles.js';

describe('library/tracks', () => {
  test('isAudioFile() filtra por extensión (rutas o claves de S3) e ignora los "._" de macOS', () => {
    assert.equal(isAudioFile('pop/canción.MP3'), true);
    assert.equal(isAudioFile('C:\\m\\a.flac'), true);
    assert.equal(isAudioFile('pop/portada.jpg'), false);
    assert.equal(isAudioFile('pop/._canción.mp3'), false);
  });

  test('baseRecord() toma el título del nombre del archivo', () => {
    const record = baseRecord('s3://m/pop/Tussi - Arcángel.mp3', 'Tussi - Arcángel.mp3', { key: 'pop/Tussi - Arcángel.mp3' });
    assert.equal(record.title, 'Tussi - Arcángel');
    assert.equal(record.titleFromFile, true);
    assert.equal(record.artist, 'Artista desconocido');
    assert.equal(record.key, 'pop/Tussi - Arcángel.mp3');
  });

  test('toTrack() pide las URLs a la plataforma (la de la carátula, solo si la tiene) y oculta los campos internos', () => {
    const urls = { track: (record) => `audio:${record.key}`, cover: (record) => `img:${record.path}` };
    assert.deepEqual(
      [toTrack({ path: 's3://m/a.mp3', key: 'a.mp3', hasCover: true }, urls).url, toTrack({ path: 's3://m/a.mp3', key: 'a.mp3', hasCover: true }, urls).cover],
      ['audio:a.mp3', 'img:s3://m/a.mp3'],
    );
    assert.equal(toTrack({ path: 's3://m/b.mp3', hasCover: false }, urls).cover, null);

    const track = mediaTrack({ path: 's3://m/a.mp3', key: 'a.mp3', etag: '"x"', size: 3, title: 'A', hasCover: true });
    assert.equal(track.url, 'media://track/s3%3A%2F%2Fm%2Fa.mp3');
    assert.equal(track.cover, 'media://cover/s3%3A%2F%2Fm%2Fa.mp3');
    for (const field of ['hasCover', 'key', 'etag', 'size']) assert.equal(field in track, false);
    assert.equal(track.online, null);
  });

  test('toTrack() versiona la carátula descargada de internet', () => {
    const track = mediaTrack({ path: 's3://m/a.mp3', hasCover: false, coverName: 'x.jpg', titleFromFile: false, online: { checkedAt: 42, status: 'found' } });
    assert.equal(track.cover, 'media://cover/s3%3A%2F%2Fm%2Fa.mp3?v=42');
    assert.equal('coverName' in track, false);
    assert.equal('titleFromFile' in track, false);
  });

  test('readRecordCover() sirve la carátula incrustada o, si no hay, la descargada (por nombre)', async () => {
    const covers = { 'a.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'b.jpg': Buffer.from([0xff, 0xd8, 0xff]) };
    const readCover = async (name) => covers[name] ?? null;
    const embedded = { readEmbedded: async () => ({ format: 'image/png', data: new Uint8Array([1]) }), readCover };
    const none = { readEmbedded: async () => null, readCover };

    assert.equal((await readRecordCover({ hasCover: false, coverName: 'a.png' }, none)).format, 'image/png');
    assert.equal((await readRecordCover({ hasCover: false, coverName: 'b.jpg' }, none)).format, 'image/jpeg');
    assert.equal(await readRecordCover({ hasCover: false, coverName: 'borrada.jpg' }, none), null);
    assert.equal(await readRecordCover({ hasCover: false, coverName: 'x.jpg' }, { ...none, readCover: async () => Promise.reject(new Error('red')) }), null);
    assert.equal(await readRecordCover({ hasCover: false }, none), null);
    assert.equal(await readRecordCover(null, none), null);
    assert.deepEqual(await readRecordCover({ hasCover: true, coverName: 'b.jpg' }, embedded), { format: 'image/png', data: new Uint8Array([1]) });
    assert.equal((await readRecordCover({ hasCover: true, coverName: 'b.jpg' }, none)).format, 'image/jpeg', 'si falla la incrustada, la de internet');

    const broken = { readEmbedded: async () => Promise.reject(new Error('S3 ocupado')), readCover };
    assert.equal((await readRecordCover({ hasCover: true, coverName: 'b.jpg' }, broken)).format, 'image/jpeg');
    await assert.rejects(readRecordCover({ hasCover: true }, broken), /S3 ocupado/, 'sin otra, el fallo no se confunde con "no tiene"');
  });
});

describe('library/remote', () => {
  let s3;
  let storage;
  const cover = encodePng(2, 2, paint(2, 2, () => [124, 92, 255, 1]));

  before(async () => {
    s3 = await startFakeS3({
      buckets: {
        musica: {
          'pop/neon.wav': createWav({
            seconds: 1,
            tags: { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '2/9', year: '2024', lyrics: 'Brillan', cover },
          }),
          'pop/Tussi - Arcángel.mp3': 'esto no es audio',
        },
      },
    });
    storage = createS3Storage(s3.config);
  });

  after(async () => {
    storage.destroy();
    await s3.close();
  });

  test('trackId() y parseTrackId() son inversas', () => {
    assert.equal(trackId('musica', 'pop/a b.mp3'), 's3://musica/pop/a b.mp3');
    assert.deepEqual(parseTrackId('s3://musica/pop/a b.mp3'), { scheme: 's3', bucket: 'musica', key: 'pop/a b.mp3' });
    assert.equal(trackId('carpetas', 'C:/Música/a.mp3', 'local'), 'local://carpetas/C:/Música/a.mp3');
    assert.deepEqual(parseTrackId('local://carpetas/C:/Música/a.mp3'), { scheme: 'local', bucket: 'carpetas', key: 'C:/Música/a.mp3' });
    assert.equal(parseTrackId('C:\\a.mp3'), null);
    assert.equal(parseTrackId('http://servidor/a.mp3'), null);
    assert.equal(isTrackId('local://carpetas/content://com.android.externalstorage.documents/document/primary%3AMusic%2Fa.mp3'), true);
    assert.equal(isTrackId(42), false);
  });

  test('id3Size() lee el tamaño de una etiqueta ID3v2 al principio', () => {
    assert.equal(id3Size(Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0x02, 0x01])), 10 + 257);
    assert.equal(id3Size(Uint8Array.from([0xff, 0xfb, 0, 0, 0, 0, 0, 0, 0, 0])), 0);
  });

  test('readRemoteRecord() lee las etiquetas desde el bucket y guarda clave, ETag y tamaño', async () => {
    const [object] = (await storage.listAudio()).filter((o) => o.key === 'pop/neon.wav');
    const record = await readRemoteRecord(storage, object);
    assert.deepEqual(
      { title: record.title, artist: record.artist, album: record.album, genre: record.genre, trackNo: record.trackNo, trackCount: record.trackCount, year: record.year, lyrics: record.lyrics, hasCover: record.hasCover },
      { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', trackNo: 2, trackCount: 9, year: 2024, lyrics: 'Brillan', hasCover: true },
    );
    assert.equal(record.path, 's3://musica/pop/neon.wav');
    assert.equal(record.key, 'pop/neon.wav');
    assert.equal(record.etag, object.etag);
    assert.deepEqual(await readRemoteCover(storage, record), { format: 'image/png', data: new Uint8Array(cover) });
  });

  test('readRemoteRecord() lee la ganancia ReplayGain de pista y disco (null si no la hay)', async () => {
    const [object] = (await storage.listAudio()).filter((o) => o.key === 'pop/neon.wav');
    assert.equal((await readRemoteRecord(storage, object)).replayGain, null);
    const gains = { key: 'pop/rg.wav', size: 0, etag: '"rg"' };
    const bytes = createWav({ seconds: 0.2, tags: { title: 'Con ganancia', trackGain: '-6.50 dB', albumGain: '+1.234 dB' } });
    const withGain = await readRemoteRecord({ bucket: 'musica', readStart: async () => new Uint8Array(bytes) }, { ...gains, size: bytes.length });
    assert.deepEqual(withGain.replayGain, { track: -6.5, album: 1.23 });
    assert.equal(withGain.tagsVersion, TAGS_VERSION);
    assert.deepEqual(mediaTrack(withGain).replayGain, { track: -6.5, album: 1.23 });
    assert.equal('tagsVersion' in mediaTrack(withGain), false);
  });

  test('readRemoteRecord() pasa a onPicture la carátula que ya ha leído', async () => {
    const [object] = (await storage.listAudio()).filter((o) => o.key === 'pop/neon.wav');
    const pictures = [];
    const record = await readRemoteRecord(storage, object, { onPicture: (rec, picture) => pictures.push([rec.path, picture]) });
    assert.deepEqual(pictures, [[record.path, { format: 'image/png', data: new Uint8Array(cover) }]]);
    const failing = await readRemoteRecord(storage, object, {
      onPicture: () => {
        throw new Error('disco lleno');
      },
    });
    assert.equal(failing.title, 'Luces de Neón', 'si no se puede guardar, el registro sigue');
  });

  test('readRemoteCover() no recuerda un fallo de descarga: la siguiente vez lo vuelve a intentar', async () => {
    const [object] = (await storage.listAudio()).filter((o) => o.key === 'pop/neon.wav');
    const record = { ...(await readRemoteRecord(storage, object)), etag: '"otra-version"' };
    let fail = true;
    const flaky = {
      bucket: 'musica',
      readStart: (key, length) => (fail ? Promise.reject(new Error('ECONNRESET')) : storage.readStart(key, length)),
    };
    await assert.rejects(readRemoteCover(flaky, record), /ECONNRESET/);
    fail = false;
    assert.equal((await readRemoteCover(flaky, record)).format, 'image/png');
  });

  test('readRemoteRecord() usa el nombre del archivo si no puede leer las etiquetas', async () => {
    const record = await readRemoteRecord(storage, { key: 'pop/Tussi - Arcángel.mp3', size: 16, etag: '"x"' });
    assert.equal(record.title, 'Tussi - Arcángel');
    assert.equal(record.titleFromFile, true);
    assert.equal(await readRemoteCover(storage, record), null);
  });
});

describe('library/store', () => {
  test('persiste los registros y los recupera en otra instancia', async () => {
    const files = memoryFiles();
    const store = createLibraryStore(files);
    await store.load();
    store.add([{ path: '/m/a.mp3', title: 'A' }]);
    await Promise.all([store.save(), store.save()]);

    const reopened = createLibraryStore(files);
    await reopened.load();

    assert.equal(reopened.has('/m/a.mp3'), true);
    assert.deepEqual(reopened.get('/m/a.mp3'), { path: '/m/a.mp3', title: 'A' });
    assert.equal(reopened.get('/m/otra.mp3'), null);
    assert.deepEqual(reopened.all(), [{ path: '/m/a.mp3', title: 'A' }]);
    assert.equal(JSON.parse(files.text('library.json')).version, 1);
  });

  test('las carátulas guardadas con su ruta pasan a guardarse por nombre; onSave avisa de cada guardado', async () => {
    const files = memoryFiles({
      'library.json': JSON.stringify({ version: 1, tracks: [{ path: 's3://m/a.mp3', coverFile: '/home/ana/.config/Pulse/covers/abc.jpg' }, { path: 's3://m/b.mp3' }] }),
    });
    let saved = 0;
    const store = createLibraryStore(files, { onSave: () => (saved += 1) });
    await store.load();
    assert.deepEqual(store.get('s3://m/a.mp3'), { path: 's3://m/a.mp3', coverName: 'abc.jpg' });
    assert.deepEqual(store.get('s3://m/b.mp3'), { path: 's3://m/b.mp3' });
    await store.save();
    assert.equal(saved, 1);
  });

  test('remove() olvida registros', () => {
    const store = createLibraryStore(memoryFiles());
    store.add([{ path: '/m/a.mp3' }, { path: '/m/b.mp3' }]);
    store.remove(['/m/a.mp3', '/m/no-existe.mp3']);
    assert.deepEqual(store.all(), [{ path: '/m/b.mp3' }]);
  });

  test('un JSON corrupto no impide arrancar: empieza vacía y avisa', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const store = createLibraryStore(memoryFiles({ 'library.json': '{ no es json' }));

    await store.load();

    assert.deepEqual(store.all(), []);
    assert.equal(warn.mock.callCount(), 1);
  });
});
