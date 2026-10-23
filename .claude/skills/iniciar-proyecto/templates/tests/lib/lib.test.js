import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';
import { normalize, compareText } from '../../src/renderer/lib/text.js';

describe('storage', () => {
  test('guarda y recupera JSON con prefijo', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);

    storage.set('volume', 0.5);

    assert.equal(backend.getItem('pulse.volume'), '0.5');
    assert.equal(storage.get('volume', 1), 0.5);
  });

  test('devuelve el valor por defecto si falta la clave o el JSON es inválido', () => {
    const storage = createStorage(createMemoryBackend({ 'pulse.roto': '{no-json' }));
    assert.deepEqual(storage.get('nada', []), []);
    assert.equal(storage.get('roto', 'def'), 'def');
  });

  test('no lanza si el backend falla o no existe', () => {
    const failing = {
      getItem() {
        throw new Error('denegado');
      },
      setItem() {
        throw new Error('lleno');
      },
    };
    assert.equal(createStorage(failing).get('x', 7), 7);
    assert.doesNotThrow(() => createStorage(failing).set('x', 1));
    assert.equal(createStorage(undefined).get('x', 3), 3);
  });
});

describe('text', () => {
  test('normalize() quita tildes y pasa a minúsculas', () => {
    assert.equal(normalize('  Canción Ñoña '), 'cancion nona');
    assert.equal(normalize(null), '');
  });

  test('compareText() ordena alfabéticamente en español', () => {
    assert.deepEqual(['b', 'Á', 'a', 'Track 10', 'Track 2'].sort(compareText), ['Á', 'a', 'b', 'Track 2', 'Track 10']);
  });
});
