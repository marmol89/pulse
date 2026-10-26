import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import desktop from '../../src/renderer/mediator/handlers/desktop.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/desktop', () => {
  test('al arrancar aplica "seguir en la bandeja" guardado y la sidebar lo enseña si hay escritorio', () => {
    const ctx = fakeContext({ desktop: spy({ available: true }) });
    ctx.settings.setCloseToTray(true);
    desktop[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.desktop.setCloseToTray), [[true]]);
    assert.deepEqual(callsOf(ctx.router.setCloseToTray), [[true, true]]);
  });

  test('cada cambio de estado o de pista llega a la bandeja', () => {
    const ctx = fakeContext({ audio: spy({ isPlaying: true }) });
    ctx.playlist.setQueue(tracks('a'));
    desktop[EVENTS.TRACK_STARTED](ctx);
    desktop[EVENTS.STATE_CHANGE](ctx, { playing: true });
    assert.deepEqual(callsOf(ctx.desktop.show).map(([now]) => [now.track.path, now.playing]), [['a', true], ['a', true]]);
  });

  test('cambiar la preferencia la guarda, la aplica y avisa', () => {
    const ctx = fakeContext({ desktop: spy({ available: true }) });
    desktop[EVENTS.SET_CLOSE_TO_TRAY](ctx, true);
    desktop[EVENTS.SET_CLOSE_TO_TRAY](ctx, false);
    assert.equal(ctx.settings.closeToTray(), false);
    assert.deepEqual(callsOf(ctx.desktop.setCloseToTray), [[true], [false]]);
    assert.deepEqual(callsOf(ctx.toast.show).map(([text]) => text), ['Al cerrar la ventana, Pulse seguirá sonando en la bandeja', 'Al cerrar la ventana, Pulse se cerrará']);
  });
});
