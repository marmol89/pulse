import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, cleanEdits, editRecord, keepNewestEdits, withEdits } from '../../src/backend/library/edits.js';
import { baseRecord, toTrack } from '../../src/backend/library/tracks.js';
import { createLibraryStore } from '../../src/backend/library/store.js';
import { createLibrarySync } from '../../src/backend/library/sync.js';
import { createS3Storage } from '../../src/backend/s3/storage.js';
import { mediaTrack } from '../../src/main/protocol/urls.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { memoryStore } from '../helpers/memoryStore.js';
import { createWav } from '../helpers/audio.js';

const URLS = { track: () => 'audio', cover: () => 'cover' };
const record = (fields = {}) => baseRecord('s3://musica/a.mp3', 'a.mp3', { title: 'Luces', titleFromFile: false, artist: 'Aurora', album: 'Neón', year: 2020, ...fields });

describe('library/edits', () => {
  test('limpia el formulario: textos recortados, título y artista vacíos fuera, números en su rango', () => {
    assert.deepEqual(cleanEdits({ title: '  Otra   canción ', artist: ' ', album: '', genre: 'Pop', year: '1999', trackNo: -1, disc: 'x', extra: 'no' }), {
      title: 'Otra canción',
      album: '',
      genre: 'Pop',
      year: 1999,
    });
    assert.equal(cleanEdits({ title: 'x'.repeat(500) }).title.length, 200);
    assert.deepEqual(cleanEdits(null), {});
  });

  test('solo guarda lo que difiere del archivo; los datos editados ganan al pintar la pista', () => {
    const edited = withEdits(record(), { title: 'Luces', artist: 'Aurora', album: 'Neón (Deluxe)', year: 2021 }, 5);
    assert.deepEqual(edited.edited, { album: 'Neón (Deluxe)', year: 2021 });
    assert.equal(edited.editedAt, 5);
    assert.equal(edited.album, 'Neón', 'lo del archivo no se toca');

    const track = toTrack(edited, URLS);
    assert.equal(track.album, 'Neón (Deluxe)');
    assert.equal(track.year, 2021);
    assert.equal(track.edited, true);
    assert.equal(track.editedAt, undefined);
    assert.equal(toTrack(record(), URLS).edited, false);
    assert.equal(applyEdits(edited).album, 'Neón (Deluxe)');
  });

  test('restaurar quita lo editado y deja la fecha para que gane a copias más antiguas', () => {
    const restored = withEdits(withEdits(record(), { album: 'Otro' }, 5), null, 8);
    assert.equal(restored.edited, null);
    assert.equal(restored.editedAt, 8);
    assert.equal(toTrack(restored, URLS).album, 'Neón');
    assert.deepEqual(keepNewestEdits(withEdits(record(), { album: 'Otro' }, 5), restored).edited, null);
  });

  test('el almacén conserva la edición más reciente aunque llegue el registro sin ella (internet, releer)', async () => {
    const files = { text: null, async readText() { return this.text; }, async write(_, text) { this.text = text; } };
    const store = createLibraryStore(files);
    store.add([record()]);
    const result = await editRecord(store, 's3://musica/a.mp3', { title: 'Luces', artist: 'Aurora', album: 'Mío' }, () => 7);
    assert.equal(result.ok, true);
    store.add([{ ...record(), online: { checkedAt: 9 } }]); // la cola de internet con el registro de antes
    assert.deepEqual(store.get('s3://musica/a.mp3').edited, { album: 'Mío' });
    assert.equal(store.get('s3://musica/a.mp3').online.checkedAt, 9);
    assert.match(files.text, /"edited":\{"album":"Mío"\}/, 'se guarda en library.json');
    assert.deepEqual(await editRecord(store, 's3://musica/otra.mp3', {}), { ok: false, error: 'Esa canción ya no está en tu biblioteca' });
  });

  describe('con el bucket', () => {
    let s3;
    before(async () => {
      s3 = await startFakeS3();
      s3.put('musica', 'a.wav', createWav({ seconds: 0.2, tags: { title: 'Luces', artist: 'Aurora' } }));
    });
    after(() => s3.close());

    test('una edición más reciente de otro equipo llega con metadatos/biblioteca.json y la de aquí sobrevive a un archivo cambiado', async () => {
      const storage = createS3Storage(s3.config);
      const store = memoryStore();
      const updated = [];
      let remote = [];
      const sync = createLibrarySync({ toTrack: mediaTrack, store, getStorage: () => storage, onChange: () => {}, onUpdated: (tracks) => updated.push(...tracks), pullMetadata: async () => remote });
      await sync.sync();
      const local = store.get('s3://musica/a.wav');

      remote = [withEdits(local, { title: 'Luces (otro equipo)', artist: 'Aurora' }, 10)];
      await sync.sync();
      assert.deepEqual(updated.map((track) => track.title), ['Luces (otro equipo)']);

      s3.put('musica', 'a.wav', createWav({ seconds: 0.3, tags: { title: 'Luces v2', artist: 'Aurora' } }));
      remote = [];
      await sync.sync();
      assert.equal(store.get('s3://musica/a.wav').title, 'Luces v2', 'se relee el archivo cambiado');
      assert.equal(mediaTrack(store.get('s3://musica/a.wav')).title, 'Luces (otro equipo)', 'y lo editado sigue ganando');
      storage.destroy();
    });
  });
});
