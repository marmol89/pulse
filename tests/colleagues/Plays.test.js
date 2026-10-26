import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Plays } from '../../src/renderer/colleagues/Plays.js';

/** Avanza la pista de `from` a `to` segundos en pasos de 0,25 s; devuelve cuántas veces dijo "cuenta". */
function play(plays, path, from, to, duration) {
  let counted = 0;
  for (let time = from; time <= to; time += 0.25) if (plays.progress(path, time, duration)) counted += 1;
  return counted;
}

describe('Plays', () => {
  test('cuenta a los 30 s escuchados, una sola vez por reproducción', () => {
    const plays = new Plays();
    plays.started('a');
    assert.equal(play(plays, 'a', 0, 29.5, 200), 0);
    assert.equal(play(plays, 'a', 29.75, 120, 200), 1);
    plays.started('a');
    assert.equal(play(plays, 'a', 0, 40, 200), 1, 'otra reproducción, otra escucha');
  });

  test('en pistas cortas basta con la mitad; saltar hacia delante no cuenta como escuchado', () => {
    const plays = new Plays();
    plays.started('corta');
    assert.equal(play(plays, 'corta', 0, 5, 10), 1);
    plays.started('larga');
    plays.progress('larga', 0, 200);
    plays.progress('larga', 150, 200); // salto
    assert.equal(play(plays, 'larga', 150, 170, 200), 0);
    assert.equal(plays.progress('otra', 50, 200), false, 'solo cuenta la que suena');
  });

  test('las más escuchadas, de más a menos; lo recibido sustituye a lo de antes', () => {
    const plays = new Plays();
    plays.set({ a: 2, b: 5, c: 1, mal: 0 });
    plays.increment('c');
    plays.increment('c');
    assert.deepEqual(plays.mostPlayed(), ['b', 'c', 'a']);
    assert.deepEqual(plays.mostPlayed(1), ['b']);
    assert.equal(plays.count('mal'), 0);
    plays.set(null);
    assert.deepEqual(plays.mostPlayed(), []);
  });
});
