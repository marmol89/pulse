import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import loudness from '../../src/renderer/mediator/handlers/loudness.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { loadTrack } from '../../src/renderer/mediator/actions.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/loudness', () => {
  test('elegir el modo lo aplica, lo refleja en la sidebar y avisa', () => {
    const ctx = fakeContext({ audio: spy({ setLoudness: (mode) => mode, loudness: 'track' }) });
    loudness[EVENTS.APP_READY](ctx);
    loudness[EVENTS.SET_LOUDNESS](ctx, 'album');
    loudness[EVENTS.SET_LOUDNESS](ctx, 'off');
    assert.deepEqual(callsOf(ctx.router.setLoudness), [['track'], ['album'], ['off']]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Volumen igualado por disco'], ['Sin igualar el volumen']]);
  });

  test('cada pista que se carga lleva su ganancia al AudioEngine', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    loadTrack(ctx, { ...a, replayGain: { track: -5, album: -4 } });
    loadTrack(ctx, b);
    assert.deepEqual(callsOf(ctx.audio.setReplayGain), [[{ track: -5, album: -4 }], [null]]);
  });

  test('si se actualiza la que suena, su ganancia se aplica al momento; las demás no', () => {
    const ctx = fakeContext({ audio: spy({ hasTrack: true }) });
    ctx.playlist.setQueue(tracks('a', 'b'));
    const [a, b] = tracks('a', 'b');
    loudness[EVENTS.TRACKS_UPDATED](ctx, [{ ...b, replayGain: { track: -2 } }]);
    loudness[EVENTS.TRACKS_UPDATED](ctx, [{ ...a, replayGain: { track: -3, album: null } }]);
    assert.deepEqual(callsOf(ctx.audio.setReplayGain), [[{ track: -3, album: null }]]);
  });
});
