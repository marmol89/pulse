import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import resume from '../../src/renderer/mediator/handlers/resume.js';
import library from '../../src/renderer/mediator/handlers/library.js';
import navigation from '../../src/renderer/mediator/handlers/navigation.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const LIBRARY = tracks('a', 'b', 'c');

describe('handlers/resume', () => {
  test('al empezar una colección y al cambiar de pista se guarda la cola', () => {
    const ctx = fakeContext();
    ctx.catalog.add(LIBRARY);
    navigation[EVENTS.TRACK_SELECTED](ctx, { source: { kind: 'library' }, path: 'b' });
    assert.deepEqual([ctx.session.load().context, ctx.session.load().queue.position], ['Tu biblioteca', 1]);
    navigation[EVENTS.NEXT](ctx);
    resume[EVENTS.NEXT](ctx);
    assert.equal(ctx.session.load().queue.position, 2);
  });

  test('guarda el segundo mientras suena y al pausar', () => {
    const ctx = fakeContext({ audio: spy({ currentTime: 61 }) });
    ctx.catalog.add(LIBRARY);
    navigation[EVENTS.PLAY_COLLECTION](ctx, { kind: 'library' });
    resume[EVENTS.TIME_UPDATE](ctx, { current: 12, duration: 200 });
    assert.equal(ctx.session.load().time, 12);
    resume[EVENTS.STATE_CHANGE](ctx, { playing: false });
    assert.equal(ctx.session.load().time, 61);
  });

  test('al abrir Pulse retoma la cola en pausa y en el segundo guardado', async () => {
    const ctx = fakeContext({ library: spy({ load: async () => LIBRARY }) });
    ctx.session.saveQueue({ paths: ['a', 'b', 'x'], order: [0, 1, 2], position: 1, shuffle: false, repeat: 'all' }, 'Neón');
    ctx.session.saveTime(42, { force: true });

    await library[EVENTS.APP_READY](ctx);

    assert.equal(ctx.playlist.current().path, 'b');
    assert.equal(ctx.playlist.repeatMode(), 'all');
    assert.deepEqual(callsOf(ctx.audio.load), [[LIBRARY[1].url, false, 42]]);
    assert.deepEqual(callsOf(ctx.nowPlaying.setContext), [['Neón']]);
    assert.deepEqual(ctx.session.load().queue.paths, ['a', 'b'], 'sin la que ya no está');
  });

  test('sin sesión o sin ninguna de sus pistas no carga nada', async () => {
    const ctx = fakeContext({ library: spy({ load: async () => LIBRARY }) });
    await library[EVENTS.APP_READY](ctx);
    ctx.session.saveQueue({ paths: ['x'], order: [0], position: 0, shuffle: false, repeat: 'off' }, 'Viejo');
    await library[EVENTS.APP_READY](ctx);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
    assert.equal(ctx.session.load(), null);
  });
});
