import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isAudioFile,
  collectAudioFiles,
  readTrackRecord,
  readTrackRecords,
  readCover,
  toTrack,
} from '../../src/main/library/tracks.js';
import { createLibraryStore } from '../../src/main/library/store.js';
import { createWav } from '../helpers/audio.js';
import { encodePng, paint } from '../../scripts/lib/png.js';

let dir;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pulse-library-'));
});

after(() => rm(dir, { recursive: true, force: true }));

describe('library/tracks', () => {
  test('isAudioFile() filtra por extensión e ignora los "._" de macOS', () => {
    assert.equal(isAudioFile('/m/canción.MP3'), true);
    assert.equal(isAudioFile('/m/portada.jpg'), false);
    assert.equal(isAudioFile('/m/._canción.mp3'), false);
  });

  test('collectAudioFiles() recorre carpetas, mezcla archivos sueltos y ordena de forma natural', async () => {
    const root = path.join(dir, 'coleccion');
    await mkdir(path.join(root, 'disco', 'extra'), { recursive: true });
    for (const name of ['disco/2.mp3', 'disco/10.mp3', 'disco/extra/b.flac', 'disco/notas.txt', 'suelto.wav']) {
      await writeFile(path.join(root, name), '');
    }

    const files = await collectAudioFiles([path.join(root, 'disco'), path.join(root, 'suelto.wav'), path.join(root, 'no-existe')]);

    assert.deepEqual(
      files.map((file) => path.relative(root, file).split(path.sep).join('/')),
      ['disco/2.mp3', 'disco/10.mp3', 'disco/extra/b.flac', 'suelto.wav'],
    );
  });

  test('readTrackRecord() lee etiquetas, letra, duración y si hay carátula', async () => {
    const file = path.join(dir, 'neon.wav');
    const cover = encodePng(2, 2, paint(2, 2, () => [124, 92, 255, 1]));
    await writeFile(
      file,
      createWav({
        seconds: 1,
        tags: { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '2/9', year: '2024', lyrics: 'Brillan', cover },
      }),
    );

    const record = await readTrackRecord(file);

    assert.deepEqual(
      { ...record, duration: Math.round(record.duration) },
      {
        path: file,
        title: 'Luces de Neón',
        artist: 'Aurora Vega',
        albumArtist: '',
        album: 'Neón',
        genre: 'Pop latino',
        trackNo: 2,
        disc: 0,
        year: 2024,
        duration: 1,
        lyrics: 'Brillan',
        hasCover: true,
      },
    );
    assert.deepEqual(await readCover(file), { format: 'image/png', data: new Uint8Array(cover) });
  });

  test('readTrackRecord() usa el nombre del archivo si no hay etiquetas o no es audio válido', async () => {
    const untagged = path.join(dir, 'sin etiquetas.wav');
    const broken = path.join(dir, 'roto.mp3');
    await writeFile(untagged, createWav({ seconds: 0.2 }));
    await writeFile(broken, 'esto no es audio');

    const [a, b] = await readTrackRecords([untagged, broken]);

    assert.equal(a.title, 'sin etiquetas');
    assert.equal(a.artist, 'Artista desconocido');
    assert.equal(b.title, 'roto');
    assert.equal(await readCover(broken), null);
  });

  test('toTrack() añade las URLs media:// y la carátula solo si existe', () => {
    const track = toTrack({ path: '/m/a.mp3', title: 'A', hasCover: true });
    assert.equal(track.url, 'media://track/%2Fm%2Fa.mp3');
    assert.equal(track.cover, 'media://cover/%2Fm%2Fa.mp3');
    assert.equal('hasCover' in track, false);
    assert.equal(toTrack({ path: '/m/b.mp3', hasCover: false }).cover, null);
  });
});

describe('library/store', () => {
  test('persiste los registros y los recupera en otra instancia', async () => {
    const file = path.join(dir, 'datos', 'library.json');
    const store = createLibraryStore(file);
    await store.load();
    store.add([{ path: '/m/a.mp3', title: 'A' }]);
    await Promise.all([store.save(), store.save()]);

    const reopened = createLibraryStore(file);
    await reopened.load();

    assert.equal(reopened.has('/m/a.mp3'), true);
    assert.deepEqual(reopened.all(), [{ path: '/m/a.mp3', title: 'A' }]);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 1);
  });

  test('un JSON corrupto no impide arrancar: empieza vacía y avisa', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const file = path.join(dir, 'corrupto.json');
    await writeFile(file, '{ no es json');
    const store = createLibraryStore(file);

    await store.load();

    assert.deepEqual(store.all(), []);
    assert.equal(warn.mock.callCount(), 1);
  });
});
