import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coverStyle, hashString, retryUrl, trackSeed } from '../../src/renderer/ui/cover.js';

describe('ui/cover', () => {
  test('coverStyle() es determinista y usa gradientes y formas del diseño', () => {
    assert.deepEqual(coverStyle('Neón'), coverStyle('Neón'));
    const gradients = new Set();
    const shapes = new Set();
    for (let i = 0; i < 200; i += 1) {
      const { gradient, shape } = coverStyle(`Álbum ${i}`);
      gradients.add(gradient);
      shapes.add(shape);
    }
    assert.deepEqual([...gradients].sort(), ['accent', 'cool', 'green', 'warm']);
    assert.deepEqual([...shapes].sort(), ['disc', 'ring', 'rings', 'triangle']);
  });

  test('hashString() devuelve un entero de 32 bits sin signo', () => {
    const hash = hashString('Luces de Neón');
    assert.ok(Number.isInteger(hash) && hash >= 0 && hash <= 0xffffffff);
    assert.notEqual(hashString('a'), hashString('b'));
  });

  test('trackSeed() agrupa por álbum y si no hay usa título o ruta', () => {
    assert.equal(trackSeed({ album: 'Neón', title: 'Intro', path: '/a' }), 'Neón');
    assert.equal(trackSeed({ album: '', title: 'Intro', path: '/a' }), 'Intro');
    assert.equal(trackSeed({ album: '', title: '', path: '/a' }), '/a');
  });

  test('retryUrl() añade la marca de reintento sin perder la versión de la carátula', () => {
    assert.equal(retryUrl('media://cover/a'), 'media://cover/a?retry=1');
    assert.equal(retryUrl('media://cover/a?v=42'), 'media://cover/a?v=42&retry=1');
  });
});
