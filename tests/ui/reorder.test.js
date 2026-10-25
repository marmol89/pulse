import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dropIndex } from '../../src/renderer/ui/reorder.js';

describe('ui/reorder', () => {
  test('dropIndex() da la posición entre los centros de las demás filas', () => {
    const middles = [30, 90, 150];
    assert.equal(dropIndex(middles, 0), 0);
    assert.equal(dropIndex(middles, 60), 1);
    assert.equal(dropIndex(middles, 149), 2);
    assert.equal(dropIndex(middles, 500), 3);
    assert.equal(dropIndex([], 10), 0);
  });
});
