import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeMediaMetadata, createNativeMediaSession } from '../../src/android/mediaSession.js';

/** Plugin PulsePlayback de mentira: apunta lo que recibe y deja lanzar acciones del sistema. */
function stubPlugin() {
  const calls = [];
  let listener = null;
  return {
    calls,
    emit: (data) => listener(data),
    addListener: (event, callback) => {
      assert.equal(event, 'action');
      listener = callback;
    },
    setMetadata: async (options) => calls.push(['metadata', options]),
    setState: async (options) => calls.push(['state', options]),
  };
}

/** fetch de mentira: las URL blob: devuelven sus propios bytes; tras `delay` ms. */
function stubFetch({ delay = 0, fail = false } = {}) {
  return async (url) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (fail) throw new TypeError('Failed to fetch');
    return new Response(new TextEncoder().encode(url));
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('la pista llega al plugin con la carátula en base64', async () => {
  const plugin = stubPlugin();
  const session = createNativeMediaSession({ plugin, fetch: stubFetch() });
  session.metadata = new NativeMediaMetadata({ title: 'Selva', artist: 'Kora', album: 'Verde', artwork: [{ src: 'blob:x' }] });
  await settle();
  assert.deepEqual(plugin.calls, [['metadata', { metadata: { title: 'Selva', artist: 'Kora', album: 'Verde', artwork: btoa('blob:x') } }]]);
  assert.equal(session.metadata.title, 'Selva');
});

test('una carátula que no se puede leer no impide mostrar la pista', async () => {
  const plugin = stubPlugin();
  const session = createNativeMediaSession({ plugin, fetch: stubFetch({ fail: true }) });
  session.metadata = new NativeMediaMetadata({ title: 'A', artwork: [{ src: 'blob:x' }] });
  await settle();
  assert.deepEqual(plugin.calls, [['metadata', { metadata: { title: 'A', artist: '', album: '', artwork: null } }]]);
});

test('si llega otra pista mientras se lee la carátula, solo se envía la última', async () => {
  const plugin = stubPlugin();
  const session = createNativeMediaSession({ plugin, fetch: stubFetch({ delay: 10 }) });
  session.metadata = new NativeMediaMetadata({ title: 'A', artwork: [{ src: 'blob:a' }] });
  session.metadata = null;
  await settle();
  assert.deepEqual(plugin.calls, [['metadata', { metadata: null }]]);
});

test('estado y posición van juntos; al parar se olvida la posición', () => {
  const plugin = stubPlugin();
  const session = createNativeMediaSession({ plugin, fetch: stubFetch() });
  session.playbackState = 'playing';
  session.setPositionState({ duration: 180, position: 42, playbackRate: 1 });
  session.playbackState = 'paused';
  session.playbackState = 'none';
  assert.deepEqual(plugin.calls, [
    ['state', { state: 'playing', position: 0, duration: 0 }],
    ['state', { state: 'playing', position: 42, duration: 180 }],
    ['state', { state: 'paused', position: 42, duration: 180 }],
    ['state', { state: 'none', position: 0, duration: 0 }],
  ]);
  assert.equal(session.playbackState, 'none');
});

test('las acciones del sistema llegan a los handlers, como en el navegador', () => {
  const plugin = stubPlugin();
  const session = createNativeMediaSession({ plugin, fetch: stubFetch() });
  const received = [];
  session.setActionHandler('nexttrack', (details) => received.push(details));
  session.setActionHandler('seekto', (details) => received.push(details));
  plugin.emit({ action: 'nexttrack' });
  plugin.emit({ action: 'seekto', seekTime: 30 });
  plugin.emit({ action: 'play' }); // sin handler: se ignora
  session.setActionHandler('nexttrack', null);
  plugin.emit({ action: 'nexttrack' });
  assert.deepEqual(received, [{ action: 'nexttrack', seekTime: undefined }, { action: 'seekto', seekTime: 30 }]);
  assert.throws(() => session.setActionHandler('skipad', () => {}), TypeError, 'como el navegador: acción no admitida');
});
