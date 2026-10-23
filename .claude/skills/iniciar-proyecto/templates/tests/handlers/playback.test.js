import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import playback from '../../src/renderer/mediator/handlers/playback.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/playback', () => {
  test('play-toggle con una pista cargada alterna play/pausa', () => {
    const ctx = fakeContext();
    ctx.audio.hasTrack.mock.mockImplementation(() => true);

    playback[EVENTS.PLAY_TOGGLE](ctx);

    assert.equal(ctx.audio.toggle.mock.callCount(), 1);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
  });

  test('play-toggle sin pista cargada carga la actual de la cola', () => {
    const ctx = fakeContext();
    const [a, b] = tracks('a', 'b');
    ctx.playlist.setQueue([a, b], 'b');

    playback[EVENTS.PLAY_TOGGLE](ctx);

    assert.deepEqual(callsOf(ctx.audio.load), [[b.url, true]]);
  });

  test('play-toggle sin cola reproduce la biblioteca', () => {
    const ctx = fakeContext();
    const [a] = tracks('a', 'b');
    ctx.catalog.add(tracks('a', 'b'));

    playback[EVENTS.PLAY_TOGGLE](ctx);

    assert.equal(ctx.playlist.size(), 2);
    assert.deepEqual(callsOf(ctx.audio.load), [[a.url, true]]);
  });

  test('play-toggle sin música no hace nada', () => {
    const ctx = fakeContext();
    playback[EVENTS.PLAY_TOGGLE](ctx);
    assert.equal(ctx.audio.load.mock.callCount(), 0);
  });

  test('seek y seek-step se delegan en el audio', () => {
    const ctx = fakeContext();
    playback[EVENTS.SEEK](ctx, 42);
    playback[EVENTS.SEEK_STEP](ctx, -5);
    assert.deepEqual(callsOf(ctx.audio.seek), [[42]]);
    assert.deepEqual(callsOf(ctx.audio.seekBy), [[-5]]);
  });

  test('volumen, pasos de volumen y silencio actualizan el audio y la player bar', () => {
    const ctx = fakeContext();
    playback[EVENTS.VOLUME_CHANGE](ctx, 0.3);
    playback[EVENTS.VOLUME_STEP](ctx, 0.05);
    playback[EVENTS.TOGGLE_MUTE](ctx);
    assert.deepEqual(callsOf(ctx.audio.setVolume), [[0.3]]);
    assert.deepEqual(callsOf(ctx.audio.stepVolume), [[0.05]]);
    assert.equal(ctx.audio.toggleMute.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.controls.setVolume), [[0.8, false], [0.8, false], [0.8, false]]);
  });

  test('app-ready muestra el volumen guardado', () => {
    const ctx = fakeContext();
    playback[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.controls.setVolume), [[0.8, false]]);
  });

  test('time-update sincroniza player bar, Reproduciendo y controles del sistema', () => {
    const ctx = fakeContext();
    playback[EVENTS.TIME_UPDATE](ctx, { current: 84, duration: 212 });
    assert.deepEqual(callsOf(ctx.controls.setProgress), [[84, 212]]);
    assert.deepEqual(callsOf(ctx.nowPlaying.setProgress), [[84, 212]]);
    assert.deepEqual(callsOf(ctx.mediaSession.setPosition), [[84, 212]]);
  });

  test('state-change refleja si suena en todas las vistas', () => {
    const ctx = fakeContext();
    playback[EVENTS.STATE_CHANGE](ctx, { playing: true });
    for (const view of [ctx.controls, ctx.nowPlaying, ctx.mediaSession, ctx.playlistView, ctx.search, ctx.home]) {
      assert.deepEqual(callsOf(view.setPlaying), [[true]]);
    }
  });
});
