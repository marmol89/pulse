import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import miniPlayer from '../../src/renderer/mediator/handlers/miniPlayer.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

describe('handlers/miniPlayer', () => {
  test('el botón solo aparece en escritorio', () => {
    const ctx = fakeContext({ desktop: spy({ available: true }) });
    miniPlayer[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.controls.setMiniAvailable), [[true]]);
  });

  test('alternar cambia la interfaz, el botón y el tamaño de la ventana', () => {
    let mini = false;
    const ctx = fakeContext({ desktop: spy({ available: true }), router: spy({ toggleMini: () => (mini = !mini) }) });
    miniPlayer[EVENTS.TOGGLE_MINI_PLAYER](ctx);
    miniPlayer[EVENTS.TOGGLE_MINI_PLAYER](ctx);
    assert.deepEqual(callsOf(ctx.controls.setMini), [[true], [false]]);
    assert.deepEqual(callsOf(ctx.desktop.setMini), [[true], [false]]);
  });

  test('en Android (sin escritorio) Ctrl+M no hace nada', () => {
    const ctx = fakeContext();
    miniPlayer[EVENTS.TOGGLE_MINI_PLAYER](ctx);
    assert.equal(ctx.router.toggleMini.mock.callCount(), 0);
  });
});
