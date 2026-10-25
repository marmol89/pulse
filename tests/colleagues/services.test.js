import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryService } from '../../src/renderer/colleagues/LibraryService.js';
import { Settings } from '../../src/renderer/colleagues/Settings.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';
import { MediaSessionBridge } from '../../src/renderer/colleagues/MediaSessionBridge.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { recordingMediator } from '../helpers/FakeAudio.js';
import { track } from '../helpers/tracks.js';

describe('Settings', () => {
  test('la búsqueda en internet está activada por defecto y se recuerda', () => {
    const storage = createStorage(createMemoryBackend());
    const settings = new Settings(storage);
    assert.equal(settings.onlineLookup(), true);
    assert.equal(settings.setOnlineLookup(false), false);
    assert.equal(new Settings(storage).onlineLookup(), false);
  });

  test('el orden de la biblioteca se recuerda (null: el de siempre)', () => {
    const storage = createStorage(createMemoryBackend());
    assert.equal(new Settings(storage).librarySort(), null);
    assert.equal(new Settings(storage).setLibrarySort('artist'), 'artist');
    assert.equal(new Settings(storage).librarySort(), 'artist');
  });
});

describe('LibraryService', () => {
  test('busca en internet y activa la búsqueda en segundo plano a través de window.api', async () => {
    const calls = [];
    const api = {
      lookupTrack: async (path, options) => calls.push(['lookup', path, options]) && { track: { path }, changed: true },
      setOnlineLookup: async (enabled) => calls.push(['enabled', enabled]),
    };
    const library = new LibraryService(api);

    assert.deepEqual(await library.lookup('/a.mp3'), { track: { path: '/a.mp3' }, changed: true });
    await library.lookup('/a.mp3', { force: true });
    await library.setOnlineLookup(false);

    assert.deepEqual(calls, [['lookup', '/a.mp3', { force: false }], ['lookup', '/a.mp3', { force: true }], ['enabled', false]]);
  });

  test('verify() pregunta al proceso main y library-changed llega al mediator', async () => {
    let push;
    const library = new LibraryService({ verifyTrack: async (path) => path === '/esta.mp3', onLibraryChanged: (callback) => (push = callback) });
    const mediator = recordingMediator();
    library.setMediator(mediator);

    assert.equal(await library.verify('/esta.mp3'), true);
    assert.equal(await library.verify('/borrada.mp3'), false);
    push({ removed: ['/borrada.mp3'], added: [] });

    assert.deepEqual(mediator.events, [[EVENTS.LIBRARY_CHANGED, { removed: ['/borrada.mp3'], added: [] }]]);
  });

  test('fotos de artista: las guardadas al pedirlas y las nuevas como artist-pictures-changed', async () => {
    let push;
    const library = new LibraryService({ getArtistPictures: async (names) => ({ [names[0]]: 'media://artist/k.jpg' }), onArtistPicturesChanged: (callback) => (push = callback) });
    const mediator = recordingMediator();
    library.setMediator(mediator);

    assert.deepEqual(await library.getArtistPictures(['Kora']), { Kora: 'media://artist/k.jpg' });
    assert.deepEqual(await new LibraryService({}).getArtistPictures(['Kora']), {}, 'sin soporte en la plataforma');
    push({ Selva: 'media://artist/s.jpg' });
    assert.deepEqual(mediator.events, [[EVENTS.ARTIST_PICTURES_CHANGED, { Selva: 'media://artist/s.jpg' }]]);
  });

  test('subir: el diálogo, lo arrastrado (solo lo que viene del disco) y el progreso', async () => {
    let push;
    const calls = [];
    const api = {
      chooseUploads: async () => null,
      pathForFile: (file) => file.path ?? '',
      uploadPaths: async (paths) => calls.push(paths) && { ok: true, total: 1, uploaded: 1, skipped: 0, failed: [] },
      onUploadProgress: (callback) => (push = callback),
    };
    const library = new LibraryService(api);
    const mediator = recordingMediator();
    library.setMediator(mediator);

    assert.equal(await library.chooseAndUpload(), null);
    assert.equal((await library.uploadFiles([{ path: 'C:/Música/a.mp3' }, { name: 'sin ruta' }])).uploaded, 1);
    push({ current: 1, total: 1, name: 'a.mp3' });

    assert.deepEqual(calls, [['C:/Música/a.mp3']]);
    assert.deepEqual(mediator.events, [[EVENTS.UPLOAD_PROGRESS, { current: 1, total: 1, name: 'a.mp3' }]]);
  });

  test('las pistas completadas en segundo plano llegan al mediator como tracks-updated', () => {
    let push;
    const library = new LibraryService({ onTracksUpdated: (callback) => (push = callback) });
    const mediator = recordingMediator();
    library.setMediator(mediator);

    push([{ path: '/a.mp3' }]);

    assert.deepEqual(mediator.events, [[EVENTS.TRACKS_UPDATED, [{ path: '/a.mp3' }]]]);
  });

  test('biblioteca y conexión S3 delegan en window.api', async () => {
    const calls = [];
    const summary = { endpoint: 'https://minio.ejemplo.com', accessKeyId: 'clave', bucket: 'app-musica', prefix: '' };
    const api = {
      loadLibrary: async () => ['guardada'],
      syncLibrary: async () => ({ added: 2, removed: 0 }),
      getConnection: async () => summary,
      saveConnection: async (input) => calls.push(input) && { ok: true, summary, count: 2 },
      importCredentials: async () => null,
    };
    const library = new LibraryService(api);

    assert.deepEqual(await library.load(), ['guardada']);
    assert.deepEqual(await library.sync(), { added: 2, removed: 0 });
    assert.deepEqual(await library.connection(), summary);
    assert.equal((await library.saveConnection({ bucket: 'app-musica' })).ok, true);
    assert.deepEqual(calls, [{ bucket: 'app-musica' }]);
    assert.equal(await library.importCredentials(), null);
  });
});

function fakeSession() {
  return {
    handlers: {},
    metadata: null,
    playbackState: 'none',
    positions: [],
    setActionHandler(action, handler) {
      if (action === 'seekto' && this.noSeek) throw new Error('no admitida');
      this.handlers[action] = handler;
    },
    setPositionState(state) {
      this.positions.push(state);
    },
  };
}

class FakeMetadata {
  constructor(init) {
    Object.assign(this, init);
  }
}

/** fetch falso: cada URL media:// responde con una imagen distinta, tras `delay` ms. */
function fakeFetch({ delay = 0, ok = true } = {}) {
  return async (url) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return new Response(new Blob([url], { type: 'image/png' }), { status: ok ? 200 : 404 });
  };
}

function setup(fetchFn = fakeFetch()) {
  const session = fakeSession();
  const bridge = new MediaSessionBridge(session, FakeMetadata, fetchFn);
  const mediator = recordingMediator();
  bridge.setMediator(mediator);
  return { session, bridge, events: mediator.events };
}

describe('MediaSessionBridge', () => {
  test('play/pause del sistema solo alternan si el estado no coincide', () => {
    const { session, bridge, events } = setup();
    session.handlers.pause();
    session.handlers.play();
    bridge.setPlaying(true);
    session.handlers.play();
    session.handlers.pause();
    assert.deepEqual(events, [[EVENTS.PLAY_TOGGLE, undefined], [EVENTS.PLAY_TOGGLE, undefined]]);
    assert.equal(session.playbackState, 'playing');
  });

  test('siguiente, anterior y saltar se reenvían al mediator', () => {
    const { session, events } = setup();
    session.handlers.nexttrack();
    session.handlers.previoustrack();
    session.handlers.seekto({ seekTime: 42 });
    assert.deepEqual(events, [[EVENTS.NEXT, undefined], [EVENTS.PREVIOUS, undefined], [EVENTS.SEEK, 42]]);
  });

  test('show() publica la pista al momento y la carátula como blob: (el sistema no acepta media://)', async () => {
    const { session, bridge } = setup();
    const shown = bridge.show(track('/a.mp3', { title: 'Selva', artist: 'Kora', album: 'Verde', cover: 'media://cover/a' }));
    assert.deepEqual({ ...session.metadata }, { title: 'Selva', artist: 'Kora', album: 'Verde', artwork: [] });

    await shown;

    assert.match(session.metadata.artwork[0].src, /^blob:/);
    assert.equal(session.metadata.title, 'Selva');
  });

  test('show() llama a fetch sin `this`, como el del navegador exige (si no: "Illegal invocation")', async () => {
    const strictFetch = fakeFetch();
    const { session, bridge } = setup(function (url) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      return strictFetch(url);
    });
    await bridge.show(track('/a.mp3', { title: 'A', cover: 'media://cover/a' }));
    assert.match(session.metadata.artwork[0]?.src ?? '', /^blob:/);
  });

  test('show() descarta la carátula de una pista que ya no suena', async () => {
    const { session, bridge } = setup(fakeFetch({ delay: 20 }));
    const first = bridge.show(track('/a.mp3', { title: 'A', cover: 'media://cover/a' }));
    const second = bridge.show(track('/b.mp3', { title: 'B' }));
    await Promise.all([first, second]);
    assert.equal(session.metadata.title, 'B');
    assert.deepEqual(session.metadata.artwork, []);
  });

  test('show() sin carátula disponible deja la pista sin imagen', async () => {
    const { session, bridge } = setup(fakeFetch({ ok: false }));
    await bridge.show(track('/a.mp3', { title: 'A', cover: 'media://cover/a' }));
    assert.deepEqual(session.metadata.artwork, []);
  });

  test('setPosition() se limita a una vez por segundo y a la duración', () => {
    const { session, bridge } = setup();
    bridge.setPosition(10, 100, 1000);
    bridge.setPosition(11, 100, 1500);
    bridge.setPosition(150, 100, 2100);
    bridge.setPosition(5, 0, 5000);
    assert.deepEqual(session.positions, [
      { duration: 100, position: 10, playbackRate: 1 },
      { duration: 100, position: 100, playbackRate: 1 },
    ]);
  });

  test('clear() deja de mostrar la pista y descarta una carátula pendiente', async () => {
    const { session, bridge } = setup(fakeFetch({ delay: 20 }));
    const shown = bridge.show(track('/a.mp3', { title: 'A', cover: 'media://cover/a' }));
    bridge.clear();
    await shown;
    assert.equal(session.metadata, null);
    assert.equal(session.playbackState, 'none');
  });

  test('sin Media Session (o con acciones no admitidas) no falla', () => {
    const bridge = new MediaSessionBridge(null, null);
    assert.doesNotThrow(() => {
      bridge.show(track('/a.mp3'));
      bridge.setPlaying(true);
      bridge.setPosition(1, 10);
    });
    const session = { ...fakeSession(), noSeek: true };
    assert.doesNotThrow(() => new MediaSessionBridge(session, FakeMetadata));
  });
});
