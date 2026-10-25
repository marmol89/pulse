import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAndroidApi, collectFiles } from '../../src/android/api.js';
import { createCapacitorFiles } from '../../src/android/files.js';
import { createKeystoreCrypto } from '../../src/android/secret.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { createWav } from '../helpers/audio.js';
import { fakeCapacitorHttp, fakeFilesystem, fakeSecureStorage } from '../helpers/fakeCapacitor.js';
import { encodePng, paint } from '../../scripts/lib/png.js';

const cover = encodePng(2, 2, paint(2, 2, () => [124, 92, 255, 1]));
/** Temporizadores que disparan enseguida (agrupar avisos no importa aquí). */
const instant = { setTimeout: (task) => setImmediate(task), clearTimeout: () => {} };

/** Espera a que llegue un aviso que cumpla `match`. */
function waitFor(subscribe, match) {
  return new Promise((resolve) => {
    const stop = subscribe((payload) => {
      if (!match(payload)) return;
      stop();
      resolve(payload);
    });
  });
}

describe('android/api (window.api sobre el backend compartido)', () => {
  let s3;
  let api;
  let fs;
  let secure;
  let http;

  before(async () => {
    s3 = await startFakeS3({
      buckets: {
        musica: {
          'pop/neon.wav': createWav({ seconds: 1, tags: { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', cover } }),
          'rock/Kora - Selva.wav': createWav({ seconds: 1 }),
        },
      },
    });
    fs = fakeFilesystem();
    secure = fakeSecureStorage();
    http = fakeCapacitorHttp();
    api = createAndroidApi({
      files: createCapacitorFiles(fs, 'DATA'),
      crypto: createKeystoreCrypto(secure),
      http,
      coverUrl: (name) => `https://localhost/_capacitor_file_/covers/${name}`,
      document: null,
      userAgent: 'Pulse/test',
      timers: instant,
    });
  });

  after(async () => {
    await (await api.ready).metadata.flush();
    await s3.close();
  });

  test('sin conexión: no hay resumen ni biblioteca', async () => {
    assert.equal(await api.getConnection(), null);
    assert.deepEqual(await api.loadLibrary(), []);
  });

  test('conecta por la red nativa y guarda la clave secreta en el Keystore, no en s3.json', async () => {
    const result = await api.saveConnection({ ...s3.config, bucket: '' });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.count, 2);
    assert.deepEqual(await api.getConnection(), { endpoint: s3.config.endpoint, accessKeyId: s3.config.accessKeyId, bucket: 'musica', prefix: '' });
    assert.equal(fs.entries.get('s3.json').data.includes(s3.config.secretAccessKey), false);
    assert.equal(secure.items.get('s3-secret'), s3.config.secretAccessKey);
    assert.ok(http.calls.length > 0, 'todo pasa por CapacitorHttp (sin CORS)');
  });

  test('sincroniza: las pistas llegan con una URL firmada que sirve rangos al <audio>', async () => {
    const changed = waitFor(api.onLibraryChanged, (change) => change.added.length === 2);
    assert.deepEqual(await api.syncLibrary(), { added: 2, removed: 0 });
    const { added } = await changed;

    const neon = added.find((track) => track.title === 'Luces de Neón');
    assert.match(neon.url, /^http:\/\/127\.0\.0\.1:\d+\/musica\/pop\/neon\.wav\?.*X-Amz-Signature=/);
    const response = await fetch(neon.url, { headers: { Range: 'bytes=0-3' } });
    assert.equal(response.status, 206);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'RIFF');
    assert.equal(added.find((track) => track.title === 'Kora - Selva').cover, null, 'sin carátula, la generada');
    assert.equal((await api.loadLibrary()).length, 2);
  });

  test('la carátula incrustada se guarda en covers/ al sincronizar, sin descargarla otra vez', async () => {
    const [track] = (await api.loadLibrary()).filter((item) => item.title === 'Luces de Neón');
    assert.match(track.cover, /^https:\/\/localhost\/_capacitor_file_\/covers\/embedded-[0-9a-f]{16}\.jpg$/);
    const name = track.cover.split('/').pop();
    assert.deepEqual(Buffer.from(fs.entries.get(`covers/${name}`).data, 'base64'), Buffer.from(cover));
  });

  test('las listas se guardan en el móvil y se suben a metadatos/listas.json del bucket', async () => {
    const [track] = await api.loadLibrary();
    const created = await api.createList('En el móvil', [track.path]);
    assert.equal(created.ok, true, created.error);
    assert.deepEqual((await api.getLists()).map(({ name, tracks }) => ({ name, tracks })), [{ name: 'En el móvil', tracks: [track.path] }]);
    assert.deepEqual(await api.renameList(created.id, '  '), { ok: false, error: 'Ponle un nombre a la lista' });
    await (await api.ready).lists.sync();
    assert.equal(JSON.parse(s3.get('musica', 'metadatos/listas.json').toString()).lists[0].name, 'En el móvil');
    assert.deepEqual((await api.deleteList(created.id)).lists, []);
  });

  test('los favoritos se guardan en el móvil y se suben a metadatos/favoritos.json del bucket', async () => {
    const [track] = await api.loadLibrary();
    assert.deepEqual(await api.setFavorite(track.path, true), { ok: true, favorites: [track.path] });
    assert.deepEqual(await api.getFavorites(), [track.path]);
    await (await api.ready).favorites.sync();
    assert.equal(JSON.parse(s3.get('musica', 'metadatos/favoritos.json').toString()).favorites[0].id, track.path);
    assert.deepEqual((await api.setFavorite(track.path, false)).favorites, []);
  });

  test('metadatos/biblioteca.json llega al bucket como JSON (no en el base64 de la red nativa)', async () => {
    await (await api.ready).metadata.flush();
    const saved = JSON.parse(s3.get('musica', 'metadatos/biblioteca.json').toString());
    assert.ok(saved.tracks.length > 0);
  });

  test('tiene los mismos métodos que el preload de Electron', async () => {
    const preload = await readFile(new URL('../../src/preload/preload.cjs', import.meta.url), 'utf8');
    const methods = [...preload.matchAll(/^ {2}(\w+): /gm)].map(([, name]) => name);
    assert.ok(methods.length > 15);
    for (const name of methods) assert.equal(typeof api[name], 'function', `falta ${name}`);
  });

  test('sube archivos elegidos en el móvil (File) sin sobrescribir y avisa del progreso', async () => {
    const progress = [];
    const stop = api.onUploadProgress((step) => progress.push(step));
    const files = [new File([createWav({ seconds: 1 })], 'Nueva.wav'), new File(['texto'], 'notas.txt')];

    const result = await api.uploadPaths(files.map(api.pathForFile));

    stop();
    assert.deepEqual(result, { ok: true, total: 1, uploaded: 1, skipped: 0, failed: [] });
    assert.deepEqual(progress, [{ current: 1, total: 1, name: 'Nueva.wav' }]);
    assert.ok(s3.get('musica', 'Nueva.wav'));
    assert.equal((await api.loadLibrary()).length, 3, 'tras subir se sincroniza');
    assert.equal((await api.uploadPaths([files[0]])).skipped, 1);
  });

  test('si una pista ya no está en el bucket, se quita', async () => {
    s3.remove('musica', 'rock/Kora - Selva.wav');
    assert.equal(await api.verifyTrack('s3://musica/rock/Kora - Selva.wav'), false);
    assert.equal(await api.verifyTrack(42), false);
    assert.equal((await api.loadLibrary()).length, 2);
  });

  test('"Eliminar del bucket" la mueve a la papelera por la red nativa, y se puede restaurar', async () => {
    assert.deepEqual(await api.trashTrack('s3://musica/Nueva.wav'), { ok: true, removed: ['s3://musica/Nueva.wav'] });
    assert.equal(s3.get('musica', 'Nueva.wav'), undefined);
    assert.ok(s3.get('musica', 'papelera/Nueva.wav'));
    assert.equal((await api.loadLibrary()).length, 1);
    const { items } = await api.getTrash();
    assert.deepEqual(items.map((item) => item.name), ['Nueva.wav']);

    assert.deepEqual(await api.restoreFromTrash('papelera/Nueva.wav'), { ok: true, items: [] });
    assert.ok(s3.get('musica', 'Nueva.wav'));
    assert.equal((await api.loadLibrary()).length, 2, 'al restaurarla se sincroniza');
  });

  test('nunca pide al Filesystem algo que no existe (cada rechazo sale como error en la consola)', () => {
    assert.equal(fs.calls.rejected, 0);
  });

  test('buscar en internet solo acepta pistas de la biblioteca', async () => {
    await assert.rejects(api.lookupTrack('s3://musica/otra.mp3'), /Pista desconocida/);
  });

  test('al arrancar otra vez lee la conexión guardada (con el secreto del Keystore) y la biblioteca', async () => {
    const reopened = createAndroidApi({
      files: createCapacitorFiles(fs, 'DATA'),
      crypto: createKeystoreCrypto(secure),
      http,
      coverUrl: (name) => `file:${name}`,
      document: null,
      userAgent: 'Pulse/test',
      timers: instant,
    });
    assert.equal((await reopened.getConnection()).bucket, 'musica');
    const library = await reopened.loadLibrary();
    assert.equal(library.length, 2);
    assert.ok(library.find((track) => track.title === 'Luces de Neón').cover.startsWith('file:embedded-'));
    assert.match(library[0].url, /X-Amz-Signature=/);
    await (await reopened.ready).metadata.flush();
  });
});

test('collectFiles() solo sube audio, con el nombre del archivo', () => {
  const items = collectFiles([new File(['a'], 'a.mp3'), new File(['b'], 'b.jpg'), 'no es un archivo']);
  assert.deepEqual(
    items.map(({ name, size }) => [name, size]),
    [['a.mp3', 1]],
  );
  assert.deepEqual(collectFiles(null), []);
});
