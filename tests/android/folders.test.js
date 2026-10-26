import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidApi } from '../../src/android/api.js';
import { createAndroidFolderStorage, localAudioUrl } from '../../src/android/folders.js';
import { createCapacitorFiles } from '../../src/android/files.js';
import { createKeystoreCrypto } from '../../src/android/secret.js';
import { createWav } from '../helpers/audio.js';
import { fakeCapacitorHttp, fakeFilesystem, fakeSecureStorage } from '../helpers/fakeCapacitor.js';

const TREE = 'content://com.android.externalstorage.documents/tree/primary%3AMusic';
const doc = (path) => `${TREE}/document/${encodeURIComponent(`primary:Music/${path}`)}`;
const instant = { setTimeout: (task) => setImmediate(task), clearTimeout: () => {} };

/**
 * El móvil falso: PulseFolders (selector, listar y devolver permisos) y el WebView que sirve el audio con rangos,
 * como FoldersPlugin.java y LocalAudioWebViewClient.java.
 */
function fakePhone(documents) {
  const released = [];
  const plugin = {
    pick: async () => ({ uri: TREE, name: 'Music' }),
    async list({ uri }) {
      if (uri !== TREE) throw new Error('Sin permiso');
      return { files: Object.entries(documents).map(([path, data]) => ({ uri: doc(path), path, size: data.length, lastModified: 1_700_000_000_000 })) };
    },
    release: async ({ uri }) => released.push(uri),
  };
  async function fetch(url, { headers = {} } = {}) {
    const uri = new URLSearchParams(url.split('?')[1]).get('uri');
    const data = Object.entries(documents).find(([path]) => doc(path) === uri)?.[1];
    if (!data) return new Response('No encontrado', { status: 404 });
    const [, from, to] = /bytes=(\d+)-(\d*)/.exec(headers.Range ?? '') ?? [];
    if (from === undefined) return new Response(data);
    const end = Math.min(to ? Number(to) : data.length - 1, data.length - 1);
    return new Response(data.subarray(Number(from), end + 1), { status: 206, headers: { 'Content-Range': `bytes ${from}-${end}/${data.length}` } });
  }
  return { plugin, fetch, released };
}

describe('android/folders (carpetas del móvil)', () => {
  const documents = {
    'Disco/01.wav': createWav({ seconds: 0.2, tags: { title: 'Ola Azul', artist: 'Marea Sur' } }),
    'notas.txt': new TextEncoder().encode('no es audio'),
  };

  test('lista el audio con su nombre aparte de la URI y lee por rangos al WebView', async () => {
    const phone = fakePhone(documents);
    const storage = createAndroidFolderStorage([{ id: TREE, name: 'Music' }], phone);
    const [object, ...rest] = await storage.listAudio();
    assert.equal(rest.length, 0, 'solo audio');
    assert.deepEqual(object, { key: doc('Disco/01.wav'), name: 'Disco/01.wav', size: documents['Disco/01.wav'].length, etag: `${documents['Disco/01.wav'].length}-1700000000000`, lastModified: 1_700_000_000_000 });
    assert.equal(new TextDecoder().decode(await storage.readStart(object.key, 4)), 'RIFF');
    assert.deepEqual(await storage.stat(object.key), { size: documents['Disco/01.wav'].length });
    assert.equal(await storage.exists(doc('borrada.wav')), false);
    assert.equal(storage.urlOf(object.key), localAudioUrl(object.key));
    assert.match(localAudioUrl(object.key), /^\/_pulse_local_\/\?uri=content%3A%2F%2F/);
    await assert.rejects(storage.upload(), TypeError);
  });

  test('una carpeta sin permiso da un error claro', async () => {
    const storage = createAndroidFolderStorage([{ id: 'content://otra/tree/x', name: 'USB' }], fakePhone(documents));
    await assert.rejects(storage.listAudio(), /No se puede leer la carpeta «USB»/);
  });

  test('window.api: elegir la carpeta, usarla en vez del bucket y escuchar desde el móvil', async () => {
    const phone = fakePhone(documents);
    const fs = fakeFilesystem();
    const api = createAndroidApi({
      files: createCapacitorFiles(fs, 'DATA'),
      crypto: createKeystoreCrypto(fakeSecureStorage()),
      http: fakeCapacitorHttp(),
      folders: phone.plugin,
      localFetch: phone.fetch,
      coverUrl: (name) => `https://localhost/_capacitor_file_/covers/${name}`,
      document: null,
      userAgent: 'Pulse/test',
      timers: instant,
    });
    assert.equal((await api.saveFolders([TREE])).ok, false, 'sin elegirla en el selector no se acepta');
    assert.deepEqual(await api.chooseFolder(), { id: TREE, name: 'Music' });
    const result = await api.saveFolders([TREE]);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.count, 1);
    assert.deepEqual(await api.getConnection(), { mode: 'local', folders: [{ id: TREE, name: 'Music' }] });

    assert.deepEqual(await api.syncLibrary(), { added: 1, removed: 0 });
    const [track] = await api.loadLibrary();
    assert.equal(track.path, `local://carpetas/${doc('Disco/01.wav')}`);
    assert.equal(track.title, 'Ola Azul');
    assert.equal(track.url, localAudioUrl(doc('Disco/01.wav')), 'suena desde el móvil, sin URL firmada');

    assert.equal((await api.createList('Viaje', [track.path])).ok, true);
    assert.ok(fs.entries.has('lists-local.json'), 'las listas se quedan en el móvil');
    assert.equal((await api.trashTrack(track.path)).ok, false, 'nunca borra de las carpetas');
    assert.equal((await api.uploadPaths([])).ok, false);
    assert.equal(await api.verifyTrack(track.path), true);
    await (await api.ready).metadata.flush();
  });
});
