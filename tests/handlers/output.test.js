import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import output from '../../src/renderer/mediator/handlers/output.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

const DEVICES = [
  { id: 'default', label: 'Predeterminado' },
  { id: 'sala', label: 'Altavoz de la sala' },
];

function contextWithDevices(current = '') {
  return fakeContext({
    audio: spy({ outputDevices: async () => DEVICES, outputDevice: current, setOutputDevice: async () => {} }),
  });
}

describe('handlers/output', () => {
  test('app-ready muestra el dispositivo actual (por defecto si no hay ninguno elegido)', async () => {
    const ctx = contextWithDevices('');
    await output[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.nowPlaying.setOutputDevice), [[DEVICES[0]]]);
  });

  test('show-output-devices lista los dispositivos marcando el actual', async () => {
    const ctx = contextWithDevices('sala');
    await output[EVENTS.SHOW_OUTPUT_DEVICES](ctx);
    assert.deepEqual(callsOf(ctx.nowPlaying.showOutputDevices), [[DEVICES, 'sala']]);
  });

  test('output-device-change cambia la salida y la refleja', async () => {
    const ctx = contextWithDevices('sala');
    await output[EVENTS.OUTPUT_DEVICE_CHANGE](ctx, 'sala');
    assert.deepEqual(callsOf(ctx.audio.setOutputDevice), [['sala']]);
    assert.deepEqual(callsOf(ctx.nowPlaying.setOutputDevice), [[DEVICES[1]]]);
  });

  test('si el cambio falla avisa y deja ver la salida que sigue activa', async () => {
    const ctx = fakeContext({
      audio: spy({
        outputDevices: async () => DEVICES,
        outputDevice: 'default',
        setOutputDevice: async () => {
          throw new Error('NotFoundError');
        },
      }),
    });
    await output[EVENTS.OUTPUT_DEVICE_CHANGE](ctx, 'desconectado');
    assert.equal(ctx.toast.show.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.nowPlaying.setOutputDevice), [[DEVICES[0]]]);
  });
});
