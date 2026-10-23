import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryService } from '../../src/renderer/colleagues/LibraryService.js';
import { MediaSessionBridge } from '../../src/renderer/colleagues/MediaSessionBridge.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { recordingMediator } from '../helpers/FakeAudio.js';
import { track } from '../helpers/tracks.js';

describe('LibraryService', () => {
  test('delega en window.api', async () => {
    const calls = [];
    const api = {
      loadLibrary: async () => ['guardada'],
      chooseFiles: async () => ['/a.mp3'],
      chooseFolder: async () => '/musica',
      importPaths: async (paths) => calls.push(paths) && ['nueva'],
      pathForFile: (file) => (file.name === 'sin-ruta' ? '' : `/drop/${file.name}`),
    };
    const library = new LibraryService(api);

    assert.deepEqual(await library.load(), ['guardada']);
    assert.deepEqual(await library.chooseFiles(), ['/a.mp3']);
    assert.equal(await library.chooseFolder(), '/musica');
    assert.deepEqual(await library.import(['/musica']), ['nueva']);
    assert.deepEqual(calls, [['/musica']]);
    assert.deepEqual(library.pathsForFiles([{ name: 'a.mp3' }, { name: 'sin-ruta' }]), ['/drop/a.mp3']);
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

function setup() {
  const session = fakeSession();
  const bridge = new MediaSessionBridge(session, FakeMetadata);
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

  test('show() publica título, artista, álbum y carátula', () => {
    const { session, bridge } = setup();
    bridge.show(track('/a.mp3', { title: 'Selva', artist: 'Kora', album: 'Verde', cover: 'media://cover/a' }));
    assert.deepEqual({ ...session.metadata }, { title: 'Selva', artist: 'Kora', album: 'Verde', artwork: [{ src: 'media://cover/a' }] });
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
