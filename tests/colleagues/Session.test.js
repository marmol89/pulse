import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../../src/renderer/colleagues/Session.js';
import { Playlist } from '../../src/renderer/colleagues/Playlist.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';
import { tracks } from '../helpers/tracks.js';

const queueAt = (start) => {
  const playlist = new Playlist();
  playlist.setQueue(tracks('a', 'b', 'c'), start);
  return playlist.snapshot();
};

describe('Session', () => {
  test('guarda la cola, de dónde venía y el segundo, y otra instancia los lee', () => {
    const storage = createStorage(createMemoryBackend());
    const session = new Session(storage);
    assert.equal(session.load(), null);
    session.saveQueue(queueAt('b'), 'Mix diario');
    session.saveTime(42, { now: 10_000 });
    assert.deepEqual(new Session(storage).load(), { queue: queueAt('b'), context: 'Mix diario', time: 42 });
  });

  test('el segundo se escribe como mucho cada 5 s, salvo con force', () => {
    const storage = createStorage(createMemoryBackend());
    const session = new Session(storage);
    session.saveQueue(queueAt('a'), 'Neón');
    session.saveTime(1, { now: 10_000 });
    session.saveTime(2, { now: 11_000 });
    assert.equal(new Session(storage).load().time, 1);
    session.saveTime(3, { now: 15_000 });
    assert.equal(new Session(storage).load().time, 3);
    session.saveTime(4, { now: 15_500, force: true });
    assert.equal(new Session(storage).load().time, 4);
  });

  test('otra pista empieza en 0; la misma conserva el segundo y, sin contexto, el de antes', () => {
    const session = new Session(createStorage(createMemoryBackend()));
    session.saveQueue(queueAt('a'), 'Neón');
    session.saveTime(30, { force: true });
    session.saveQueue(queueAt('a'));
    assert.deepEqual([session.load().time, session.load().context], [30, 'Neón']);
    session.saveQueue(queueAt('b'));
    assert.equal(session.load().time, 0);
  });

  test('una cola vacía o un valor guardado roto no dejan sesión', () => {
    const session = new Session(createStorage(createMemoryBackend()));
    session.saveQueue(queueAt('a'), 'Neón');
    session.saveQueue(new Playlist().snapshot());
    assert.equal(session.load(), null);
    assert.equal(new Session(createStorage(createMemoryBackend({ 'pulse.session': '{"queue":5}' }))).load(), null);
  });
});
