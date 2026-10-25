import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../../src/renderer/colleagues/AudioEngine.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';
import { FakeAudio, recordingMediator } from '../helpers/FakeAudio.js';

function setup({ storage = createStorage(createMemoryBackend()), devices = null } = {}) {
  const audio = new FakeAudio();
  const engine = new AudioEngine(audio, storage, devices);
  const mediator = recordingMediator();
  engine.setMediator(mediator);
  return { audio, engine, storage, events: mediator.events };
}

const names = (events) => events.map(([name]) => name);

describe('AudioEngine', () => {
  test('load() asigna la fuente y reproduce si autoplay', () => {
    const { audio, engine, events } = setup();

    engine.load('media://track/a', true);

    assert.equal(audio.src, 'media://track/a');
    assert.equal(engine.hasTrack(), true);
    assert.equal(engine.isPlaying(), true);
    assert.deepEqual(events, [[EVENTS.STATE_CHANGE, { playing: true }]]);
  });

  test('load() sin autoplay solo prepara la pista', () => {
    const { audio, engine } = setup();
    engine.load('media://track/a', false);
    assert.equal(audio.playCalls, 0);
  });

  test('fadeOut() baja el volumen poco a poco, pausa y lo deja como estaba', async () => {
    const { audio, engine, storage } = setup();
    engine.setVolume(0.5);
    engine.load('media://track/a', true);
    const volumes = [];
    const timers = { setTimeout: (task) => setImmediate(() => (volumes.push(audio.volume), task())) };
    await engine.fadeOut(100, { steps: 4, timers });
    assert.deepEqual(volumes, [0.5, 0.375, 0.25, 0.125]);
    assert.equal(engine.isPlaying(), false);
    assert.equal(audio.volume, 0.5);
    assert.equal(storage.get('volume'), 0.5, 'el volumen guardado no cambia');
    await engine.fadeOut(100, { timers }); // sin sonar: no hace nada
  });

  test('track-started se emite una vez por pista cargada, no al reanudar', () => {
    const { audio, engine, events } = setup();
    engine.load('media://track/a');
    audio.emit('playing');
    audio.emit('playing');
    assert.equal(names(events).filter((name) => name === EVENTS.TRACK_STARTED).length, 1);
  });

  test('time-update informa del tiempo y la duración (0 si aún no se conoce)', () => {
    const { audio, events } = setup();
    audio.emit('durationchange');
    audio.currentTime = 12;
    audio.duration = 200;
    audio.emit('timeupdate');
    assert.deepEqual(events, [
      [EVENTS.TIME_UPDATE, { current: 0, duration: 0 }],
      [EVENTS.TIME_UPDATE, { current: 12, duration: 200 }],
    ]);
  });

  test('un error avisa, marca la pausa y cuenta fallos seguidos hasta que algo suena', () => {
    const { audio, engine, events } = setup();
    engine.load('media://track/rota');
    audio.error = { code: 4 };
    audio.emit('error');
    audio.emit('error');

    assert.equal(engine.consecutiveErrors(), 2);
    assert.deepEqual(events.at(-1), [EVENTS.ERROR, { message: 'No se puede reproducir este formato de audio' }]);
    assert.deepEqual(events.at(-2), [EVENTS.STATE_CHANGE, { playing: false }]);

    audio.emit('playing');
    assert.equal(engine.consecutiveErrors(), 0);
  });

  test('stop() para y olvida la pista: sin pista cargada y sin track-started pendiente', () => {
    const { audio, engine, events } = setup();
    engine.load('media://track/borrada');

    engine.stop();
    audio.emit('playing');

    assert.equal(engine.hasTrack(), false);
    assert.equal(engine.isPlaying(), false);
    assert.equal(audio.src, '');
    assert.equal(events.filter(([name]) => name === EVENTS.TRACK_STARTED).length, 0);
  });

  test('ended se reenvía al mediator', () => {
    const { audio, events } = setup();
    audio.emit('ended');
    assert.deepEqual(names(events), [EVENTS.ENDED]);
  });

  test('toggle() alterna entre reproducir y pausar', () => {
    const { engine } = setup();
    engine.load('media://track/a');
    engine.toggle();
    assert.equal(engine.isPlaying(), false);
    engine.toggle();
    assert.equal(engine.isPlaying(), true);
  });

  test('seek() limita a la duración y no hace nada sin pista', () => {
    const { audio, engine } = setup();
    engine.seek(10);
    assert.equal(audio.currentTime, 0);

    engine.load('media://track/a');
    audio.duration = 100;
    engine.seek(150);
    assert.equal(audio.currentTime, 100);
    engine.seekBy(-30);
    assert.equal(audio.currentTime, 70);
    engine.seek(Number.NaN);
    assert.equal(audio.currentTime, 70);
  });

  test('el volumen se limita, se persiste y al subirlo se quita el silencio', () => {
    const { engine, storage } = setup();
    engine.toggleMute();
    assert.equal(engine.isMuted(), true);

    assert.equal(engine.setVolume(1.5), 1);
    assert.equal(engine.isMuted(), false);
    assert.equal(engine.stepVolume(-0.25), 0.75);
    assert.equal(storage.get('volume'), 0.75);
    assert.equal(engine.setVolume(-1), 0);
  });

  test('recupera el volumen y el silencio guardados', () => {
    const storage = createStorage(createMemoryBackend());
    storage.set('volume', 0.3);
    storage.set('muted', true);
    const { engine } = setup({ storage });
    assert.equal(engine.volume(), 0.3);
    assert.equal(engine.isMuted(), true);
  });

  test('outputDevices() lista solo salidas de audio (sin "comunicaciones") y setOutputDevice() la persiste', async () => {
    const devices = {
      enumerateDevices: async () => [
        { kind: 'audioinput', deviceId: 'mic', label: 'Micro' },
        { kind: 'audiooutput', deviceId: 'default', label: 'Predeterminado' },
        { kind: 'audiooutput', deviceId: 'communications', label: 'Comunicaciones' },
        { kind: 'audiooutput', deviceId: 'usb', label: '' },
      ],
    };
    const { engine, storage } = setup({ devices });

    assert.deepEqual(await engine.outputDevices(), [
      { id: 'default', label: 'Predeterminado' },
      { id: 'usb', label: '' },
    ]);
    await engine.setOutputDevice('usb');
    assert.equal(engine.outputDevice(), 'usb');
    assert.equal(storage.get('outputDevice'), 'usb');
  });

  test('sin mediaDevices no hay dispositivos que listar', async () => {
    const { engine } = setup();
    assert.deepEqual(await engine.outputDevices(), []);
  });
});
