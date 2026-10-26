import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import equalizer from '../../src/renderer/mediator/handlers/equalizer.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

const STATE = { preset: 'flat', gains: [0, 0, 0, 0, 0], bands: [] };

describe('handlers/equalizer', () => {
  test('al arrancar dice a la sidebar si hay ecualizador y le pasa la salida elegida', async () => {
    const ctx = fakeContext({ audio: spy({ outputDevice: 'altavoz' }), equalizer: spy({ available: true, setOutputDevice: async () => {} }) });
    await equalizer[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.router.setEqualizerAvailable), [[true]]);
    assert.deepEqual(callsOf(ctx.equalizer.setOutputDevice), [['altavoz']]);
  });

  test('abre el diálogo con el ajuste actual (si está disponible)', () => {
    const ctx = fakeContext({ equalizer: spy({ available: true, state: STATE }) });
    equalizer[EVENTS.OPEN_EQUALIZER](ctx);
    assert.deepEqual(callsOf(ctx.equalizerDialog.open), [[STATE]]);
    const android = fakeContext({ equalizer: spy({ available: false }) });
    equalizer[EVENTS.OPEN_EQUALIZER](android);
    assert.equal(android.equalizerDialog.open.mock.callCount(), 0);
  });

  test('preajustes y bandas se aplican y el diálogo pinta lo aplicado', () => {
    const ctx = fakeContext({
      equalizer: spy({ setPreset: (name) => ({ ...STATE, preset: name }), setBand: (index, gain) => ({ ...STATE, preset: 'custom', gains: [gain] }) }),
    });
    equalizer[EVENTS.SET_EQUALIZER_PRESET](ctx, 'bass');
    equalizer[EVENTS.SET_EQUALIZER_BAND](ctx, { index: 0, gain: 5 });
    assert.deepEqual(callsOf(ctx.equalizer.setBand), [[0, 5]]);
    assert.deepEqual(callsOf(ctx.equalizerDialog.show).map(([state]) => state.preset), ['bass', 'custom']);
  });

  test('la salida elegida también va al ecualizador; si falla, avisa', async () => {
    const ctx = fakeContext({ equalizer: spy({ setOutputDevice: async () => Promise.reject(new Error('no')) }) });
    await equalizer[EVENTS.OUTPUT_DEVICE_CHANGE](ctx, 'cascos');
    assert.deepEqual(callsOf(ctx.equalizer.setOutputDevice), [['cascos']]);
    assert.equal(callsOf(ctx.toast.show)[0][0], 'No se pudo cambiar la salida del ecualizador');
  });
});
