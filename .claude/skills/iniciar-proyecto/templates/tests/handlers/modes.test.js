import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import modes from '../../src/renderer/mediator/handlers/modes.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const lastModes = (view) => callsOf(view.setModes).at(-1)[0];

describe('handlers/modes', () => {
  test('app-ready muestra los modos iniciales', () => {
    const ctx = fakeContext();
    modes[EVENTS.APP_READY](ctx);
    assert.deepEqual(lastModes(ctx.controls), { shuffle: false, repeat: 'off' });
  });

  test('toggle-shuffle cambia el aleatorio y lo refleja en los controles', () => {
    const ctx = fakeContext();
    modes[EVENTS.TOGGLE_SHUFFLE](ctx);
    assert.equal(ctx.playlist.isShuffle(), true);
    assert.deepEqual(lastModes(ctx.controls), { shuffle: true, repeat: 'off' });
    assert.deepEqual(lastModes(ctx.nowPlaying), { shuffle: true, repeat: 'off' });
  });

  test('cycle-repeat avanza el modo repetir', () => {
    const ctx = fakeContext();
    modes[EVENTS.CYCLE_REPEAT](ctx);
    assert.deepEqual(lastModes(ctx.controls), { shuffle: false, repeat: 'all' });
  });

  test('play-mix reproduce toda la biblioteca en aleatorio', () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b', 'c'));

    modes[EVENTS.PLAY_MIX](ctx);

    assert.equal(ctx.playlist.isShuffle(), true);
    assert.equal(ctx.playlist.size(), 3);
    assert.equal(ctx.audio.load.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.nowPlaying.setContext), [['Mix diario']]);
  });
});
