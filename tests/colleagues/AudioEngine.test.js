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

  test('fadeOut() respeta el volumen que se cambie mientras baja y el de igualar volumen', async () => {
    const { audio, engine } = setup();
    engine.setVolume(0.5);
    engine.load('media://track/a', true);
    engine.setReplayGain({ track: -6.0206, album: null }); // la mitad
    const volumes = [];
    let step = 0;
    const timers = {
      setTimeout: (task) =>
        setImmediate(() => {
          step += 1;
          if (step === 2) engine.setVolume(1); // a mitad del fundido
          volumes.push(Math.round(audio.volume * 1000) / 1000);
          task();
        }),
    };
    await engine.fadeOut(100, { steps: 4, timers });
    assert.deepEqual(volumes, [0.25, 0.375, 0.25, 0.125]);
    assert.equal(Math.round(audio.volume * 1000) / 1000, 0.5, 'queda con el volumen nuevo, a la mitad por igualar');
    assert.equal(engine.volume(), 1);
  });

  test('load() con startAt empieza en ese segundo cuando el audio conoce su duración', () => {
    const { audio, engine } = setup();
    engine.load('media://track/a', false, 42);
    assert.equal(audio.currentTime, 0);
    audio.emit('loadedmetadata');
    assert.equal(audio.currentTime, 42);
    engine.load('media://track/b', false);
    audio.currentTime = 0;
    audio.emit('loadedmetadata');
    assert.equal(audio.currentTime, 0, 'la siguiente pista empieza desde el principio');
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

/** Intervalos manuales: tick(n) avanza n pasos de 50 ms. */
function manualTimers() {
  const intervals = new Map();
  let next = 1;
  return {
    setInterval: (callback) => {
      intervals.set(next, callback);
      return next++;
    },
    clearInterval: (id) => intervals.delete(id),
    tick(steps = 1) {
      for (let i = 0; i < steps; i += 1) for (const callback of [...intervals.values()]) callback();
    },
    active: () => intervals.size,
  };
}

function setupTwo({ crossfade = 0 } = {}) {
  const storage = createStorage(createMemoryBackend());
  storage.set('crossfade', crossfade);
  const [first, second] = [new FakeAudio(), new FakeAudio()];
  const timers = manualTimers();
  const engine = new AudioEngine(first, storage, null, { standby: second, timers });
  const mediator = recordingMediator();
  engine.setMediator(mediator);
  return { first, second, engine, timers, storage, events: mediator.events };
}

/** El elemento llega a `current` de `duration` segundos. */
function playTo(element, current, duration = 200) {
  element.duration = duration;
  element.currentTime = current;
  element.emit('timeupdate');
}

describe('AudioEngine · sin cortes y fundido', () => {
  test('a 20 s del final avisa una vez con near-end; volver atrás lo rearma', () => {
    const { first, engine, events } = setupTwo();
    engine.load('media://track/a');
    playTo(first, 100);
    playTo(first, 181);
    playTo(first, 185);
    playTo(first, 50);
    playTo(first, 190);
    assert.equal(names(events).filter((name) => name === EVENTS.NEAR_END).length, 2);
  });

  test('la siguiente precargada empieza en el otro elemento; los eventos del que ya no suena no cuentan', () => {
    const { first, second, engine, events } = setupTwo();
    engine.load('media://track/a');
    engine.prepareNext('media://track/b');
    assert.equal(second.src, 'media://track/b');
    assert.equal(second.playCalls, 0, 'precarga sin sonar');

    first.emit('ended');
    engine.load('media://track/b');

    assert.equal(second.paused, false);
    assert.equal(first.paused, true);
    assert.equal(first.src, '', 'la anterior se vacía');
    events.length = 0;
    first.emit('timeupdate');
    first.emit('ended');
    assert.deepEqual(events, []);
    second.emit('playing');
    assert.deepEqual(names(events), [EVENTS.TRACK_STARTED]);
  });

  test('si se elige otra pista, la precargada se descarta y suena la elegida en el mismo elemento', () => {
    const { first, second, engine } = setupTwo();
    engine.load('media://track/a');
    engine.prepareNext('media://track/b');
    engine.load('media://track/z');
    assert.equal(first.src, 'media://track/z');
    assert.equal(second.src, '');
  });

  test('con fundido, ended llega antes y las dos pistas se cruzan', () => {
    const { first, second, engine, timers, events } = setupTwo({ crossfade: 4 });
    engine.setVolume(0.5);
    engine.load('media://track/a');
    playTo(first, 180);
    engine.prepareNext('media://track/b');
    playTo(first, 195);
    assert.equal(names(events).filter((name) => name === EVENTS.ENDED).length, 0);
    playTo(first, 196.5);
    assert.equal(names(events).filter((name) => name === EVENTS.ENDED).length, 1, 'quedan 3,5 s < 4 s de fundido');

    engine.load('media://track/b');
    assert.equal(second.volume, 0, 'la nueva empieza en silencio');
    assert.equal(first.paused, false, 'la anterior sigue sonando mientras baja');
    timers.tick(40); // la mitad de 4 s
    assert.equal(second.volume, 0.25);
    assert.equal(first.volume, 0.25);
    timers.tick(40);
    assert.equal(second.volume, 0.5);
    assert.equal(first.paused, true);
    assert.equal(first.src, '');
    assert.equal(timers.active(), 0);
    first.emit('ended');
    assert.equal(names(events).filter((name) => name === EVENTS.ENDED).length, 1, 'el final de verdad ya no avisa');
  });

  test('durante el fundido, la siguiente se precarga cuando la anterior termina de apagarse', () => {
    const { first, second, engine, timers } = setupTwo({ crossfade: 4 });
    engine.load('media://track/a');
    playTo(first, 197);
    engine.load('media://track/b');
    engine.prepareNext('media://track/c');
    assert.equal(first.src, 'media://track/a', 'no corta la que se apaga');
    timers.tick(80);
    assert.equal(first.src, 'media://track/c');
    assert.equal(second.src, 'media://track/b');
  });

  test('pausar en mitad del fundido apaga también la que terminaba', () => {
    const { first, engine } = setupTwo({ crossfade: 4 });
    engine.load('media://track/a');
    playTo(first, 197);
    engine.load('media://track/b');
    engine.pause();
    assert.equal(first.paused, true);
    assert.equal(first.src, '');
  });

  test('sin fundido o en pistas cortas, ended llega al final de verdad', () => {
    const short = setupTwo({ crossfade: 8 });
    short.engine.load('media://track/a');
    playTo(short.first, 18, 20);
    assert.equal(names(short.events).includes(EVENTS.ENDED), false, 'una pista de 20 s no se funde');

    const plain = setupTwo();
    plain.engine.load('media://track/a');
    playTo(plain.first, 199.9);
    plain.first.emit('ended');
    assert.equal(names(plain.events).filter((name) => name === EVENTS.ENDED).length, 1);
  });

  test('el fundido se recuerda (0–8 s) y sin segundo elemento no hay', () => {
    const { engine, storage } = setupTwo();
    assert.equal(engine.crossfade(), 0);
    assert.equal(engine.setCrossfade(12), 8);
    assert.equal(storage.get('crossfade'), 8);
    assert.equal(setup().engine.setCrossfade(4), 0);
  });

  test('volumen, silencio y salida de audio valen para los dos elementos', async () => {
    const { first, second, engine } = setupTwo();
    engine.setVolume(0.3);
    engine.toggleMute();
    await engine.setOutputDevice('usb');
    assert.deepEqual([first.volume, second.volume, first.muted, second.muted, first.sinkId, second.sinkId], [0.3, 0.3, true, true, 'usb', 'usb']);
  });
});

describe('AudioEngine · volumen uniforme', () => {
  test('por canción (lo predeterminado), baja según la ganancia de la pista; las positivas no suben', () => {
    const { audio, engine } = setup();
    engine.setVolume(0.8);
    engine.load('media://track/a');
    engine.setReplayGain({ track: -6.02, album: -3 });
    assert.equal(engine.loudness(), 'track');
    assert.ok(Math.abs(audio.volume - 0.4) < 0.001, `0,8 × −6 dB ≈ 0,4 (${audio.volume})`);

    engine.load('media://track/b');
    engine.setReplayGain({ track: 4, album: null });
    assert.equal(audio.volume, 0.8);
    engine.load('media://track/c');
    engine.setReplayGain(null);
    assert.equal(audio.volume, 0.8, 'sin etiqueta, sin cambios');
  });

  test('por disco usa la del disco (o la de la pista si no hay); desactivado no toca nada; se guarda', () => {
    const { audio, engine, storage } = setup();
    engine.setVolume(1);
    engine.load('media://track/a');
    engine.setReplayGain({ track: -20, album: -6.02 });
    assert.equal(engine.setLoudness('album'), 'album');
    assert.ok(Math.abs(audio.volume - 0.5) < 0.001);
    engine.setReplayGain({ track: -6.02, album: null });
    assert.ok(Math.abs(audio.volume - 0.5) < 0.001);
    engine.setLoudness('off');
    assert.equal(audio.volume, 1);
    assert.equal(storage.get('loudness'), 'off');
    assert.equal(engine.setLoudness('raro'), 'track');
    assert.equal(setup({ storage }).engine.loudness(), 'track');
  });

  test('con fundido, cada elemento conserva la ganancia de su pista', () => {
    const { first, second, engine, timers } = setupTwo({ crossfade: 4 });
    engine.setVolume(1);
    engine.load('media://track/a');
    engine.setReplayGain({ track: -6.02 });
    playTo(first, 197);
    engine.load('media://track/b');
    engine.setReplayGain({ track: 0 });
    timers.tick(40);
    assert.ok(Math.abs(first.volume - 0.25) < 0.001, `la que baja: 0,5 × 0,5 (${first.volume})`);
    assert.equal(second.volume, 0.5);
    timers.tick(40);
    assert.equal(second.volume, 1);
  });
});
