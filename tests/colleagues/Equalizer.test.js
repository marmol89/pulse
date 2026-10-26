import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Equalizer, EQ_PRESETS } from '../../src/renderer/colleagues/Equalizer.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';

/** AudioContext falso: guarda los nodos creados y sus conexiones. */
function fakeAudioContext() {
  const created = { contexts: 0, sources: [], filters: [], gains: [], sinks: [] };
  const node = (extra = {}) => ({ connections: [], connect(target) { this.connections.push(target); }, ...extra });
  const param = (value = 0) => ({ value });
  const createContext = () => {
    created.contexts += 1;
    const context = {
      state: 'running',
      destination: node({ name: 'salida' }),
      createBiquadFilter: () => {
        const filter = node({ type: '', frequency: param(), gain: param(), Q: param() });
        created.filters.push(filter);
        return filter;
      },
      createGain: () => {
        const gain = node({ gain: param(1) });
        created.gains.push(gain);
        return gain;
      },
      createMediaElementSource: (element) => {
        const source = node({ element });
        created.sources.push(source);
        return source;
      },
      setSinkId: async (id) => created.sinks.push(id),
    };
    created.context = context;
    return context;
  };
  return { created, createContext };
}

function setup({ storage = createStorage(createMemoryBackend()), available = true } = {}) {
  const { created, createContext } = fakeAudioContext();
  const elements = [{ id: 'a' }, { id: 'b' }];
  const equalizer = new Equalizer(elements, storage, { createContext, available });
  return { equalizer, created, storage, elements };
}

describe('Equalizer', () => {
  test('plano no monta nada: el audio sigue sonando como siempre', () => {
    const { equalizer, created } = setup();
    assert.deepEqual(equalizer.state().gains, [0, 0, 0, 0, 0]);
    assert.equal(equalizer.state().preset, 'flat');
    equalizer.setPreset('flat');
    assert.equal(created.contexts, 0);
    assert.equal(equalizer.isActive(), false);
  });

  test('un preajuste monta la cadena una vez: los dos elementos → 5 filtros → preamplificador → salida', () => {
    const { equalizer, created, elements } = setup();
    equalizer.setPreset('bass');
    equalizer.setPreset('vocal');
    assert.equal(created.contexts, 1);
    assert.deepEqual(created.sources.map((source) => source.element), elements);
    assert.deepEqual(created.filters.map((filter) => filter.type), ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf']);
    assert.deepEqual(created.filters.map((filter) => filter.frequency.value), [60, 230, 910, 3600, 14000]);
    assert.deepEqual(created.filters.map((filter) => filter.gain.value), EQ_PRESETS.vocal.gains);
    assert.ok(created.sources.every((source) => source.connections[0] === created.filters[0]));
    assert.equal(created.filters[4].connections[0], created.gains[0]);
    assert.equal(created.gains[0].connections[0], created.context.destination);
    assert.ok(Math.abs(created.gains[0].gain.value - 10 ** (-4 / 20)) < 1e-9, 'baja lo que sube la banda más alta');

    equalizer.setPreset('flat');
    assert.deepEqual(created.filters.map((filter) => filter.gain.value), [0, 0, 0, 0, 0], 'ya montada, vuelve a plano sin desmontarse');
    assert.equal(created.gains[0].gain.value, 1);
  });

  test('mover una banda lo deja en "Personalizado" (o en el preajuste que coincida) y se limita a ±12 dB', () => {
    const { equalizer } = setup();
    assert.equal(equalizer.setBand(0, 6).preset, 'custom');
    assert.equal(equalizer.setBand(1, 4).preset, 'bass');
    assert.deepEqual(equalizer.setBand(4, 40).gains, [6, 4, 0, 0, 12]);
    assert.deepEqual(equalizer.setBand(9, 3).gains, [6, 4, 0, 0, 12], 'banda inexistente: nada');
    assert.equal(equalizer.setPreset('no-existe').preset, 'custom');
  });

  test('se guarda y, al arrancar con un ajuste no plano, ya suena ecualizado', () => {
    const { equalizer, storage } = setup();
    equalizer.setPreset('treble');
    const again = setup({ storage });
    assert.equal(again.equalizer.state().preset, 'treble');
    assert.equal(again.created.contexts, 1);
    assert.deepEqual(again.created.filters.map((filter) => filter.gain.value), EQ_PRESETS.treble.gains);
  });

  test('la salida elegida pasa al AudioContext solo con la cadena montada (también la elegida antes)', async () => {
    const { equalizer, created } = setup();
    await equalizer.setOutputDevice('altavoz');
    assert.deepEqual(created.sinks, []);
    equalizer.setPreset('bass');
    await Promise.resolve();
    await equalizer.setOutputDevice('default');
    assert.deepEqual(created.sinks, ['altavoz', '']);
  });

  test('sin Web Audio usable (Android) no está disponible ni monta nada', () => {
    const { equalizer, created } = setup({ available: false });
    assert.equal(equalizer.available(), false);
    equalizer.setPreset('bass');
    assert.equal(created.contexts, 0);
  });
});
