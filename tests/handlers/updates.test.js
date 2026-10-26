import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import updates from '../../src/renderer/mediator/handlers/updates.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

describe('handlers/updates', () => {
  test('al arrancar enseña el aviso si ya hay una versión descargada (y si no, nada)', async () => {
    const ctx = fakeContext({ desktop: spy({ updateStatus: { state: 'ready', version: '0.6.0' } }) });
    await updates[EVENTS.APP_READY](ctx);
    const plain = fakeContext();
    await updates[EVENTS.APP_READY](plain);
    assert.deepEqual(callsOf(ctx.router.setUpdate), [['0.6.0']]);
    assert.deepEqual(callsOf(plain.router.setUpdate), [[null]]);
  });

  test('al descargarse una versión nueva avisa en la sidebar y con un aviso', () => {
    const ctx = fakeContext();
    updates[EVENTS.UPDATE_STATUS](ctx, { state: 'ready', version: '0.6.0' });
    assert.deepEqual(callsOf(ctx.router.setUpdate), [['0.6.0']]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Pulse 0.6.0 está lista: se instalará al cerrar']]);
  });

  test('"Reiniciar ahora" pide al main instalarla', () => {
    const ctx = fakeContext();
    updates[EVENTS.INSTALL_UPDATE](ctx);
    assert.equal(ctx.desktop.installUpdate.mock.callCount(), 1);
  });
});
