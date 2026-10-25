import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';
import { normalize, compareText } from '../../src/renderer/lib/text.js';
import { parseLrc, activeLine } from '../../src/renderer/lib/lrc.js';

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

describe('lrc', () => {
  test('convierte la letra LRC en versos ordenados, con varias marcas y offset', () => {
    const lyrics = parseLrc('[ar:Kora]\n[offset:+500]\n[00:12.50]Segundo\n[00:02.00][01:00.25] Estribillo\n[00:30]\nsin marca\n[1:05:30] tres cifras');
    assert.deepEqual(lyrics, [
      { time: 1.5, text: 'Estribillo' },
      { time: 12, text: 'Segundo' },
      { time: 29.5, text: '' },
      { time: 59.75, text: 'Estribillo' },
      { time: 64.8, text: 'tres cifras' },
    ]);
    assert.deepEqual(parseLrc(''), []);
    assert.deepEqual(parseLrc(null), []);
  });

  test('activeLine() da el último verso que ya ha empezado', () => {
    const lines = parseLrc('[00:01.00]a\n[00:05.00]b\n[00:09.00]c');
    assert.deepEqual([0, 1, 4.99, 5, 100].map((seconds) => activeLine(lines, seconds)), [-1, 0, 0, 1, 2]);
    assert.equal(activeLine([], 3), -1);
  });
});
