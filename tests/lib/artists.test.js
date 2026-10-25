import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitArtists } from '../../src/renderer/lib/artists.js';

describe('lib/artists', () => {
  test('splitArtists() separa las colaboraciones', () => {
    assert.deepEqual(splitArtists('Farruko, Victor Cardenas, Dj Alberto'), ['Farruko', 'Victor Cardenas', 'Dj Alberto']);
    assert.deepEqual(splitArtists('Franco "El Gorilla", Yandel'), ['Franco "El Gorilla"', 'Yandel']);
    assert.deepEqual(splitArtists('Bad Bunny X Jhay Cortez'), ['Bad Bunny', 'Jhay Cortez']);
    assert.deepEqual(splitArtists('Rosalía & J Balvin'), ['Rosalía', 'J Balvin']);
    assert.deepEqual(splitArtists('Maluma feat. Nicky Jam'), ['Maluma', 'Nicky Jam']);
    assert.deepEqual(splitArtists('Daddy Yankee ft Snow'), ['Daddy Yankee', 'Snow']);
    assert.deepEqual(splitArtists('Sebastián Yatra (feat. Beéle, Myke Towers)'), ['Sebastián Yatra', 'Beéle', 'Myke Towers']);
    assert.deepEqual(splitArtists('Lirico En La Casa; Atomic Otro Way'), ['Lirico En La Casa', 'Atomic Otro Way']);
  });

  test('splitArtists() respeta los nombres que no son colaboraciones', () => {
    assert.deepEqual(splitArtists('Linkin Park'), ['Linkin Park']);
    assert.deepEqual(splitArtists('Simon & Garfunkel'), ['Simon & Garfunkel']);
    assert.deepEqual(splitArtists('Earth, Wind & Fire'), ['Earth, Wind & Fire']);
    assert.deepEqual(splitArtists('Tyler, The Creator'), ['Tyler, The Creator']);
    assert.deepEqual(splitArtists('Xavier Rudd'), ['Xavier Rudd'], 'una x al principio no separa');
    assert.deepEqual(splitArtists('Simon & Garfunkel, Paul Simon'), ['Simon & Garfunkel', 'Paul Simon']);
    assert.deepEqual(splitArtists('Tyler, The Creator feat. Kali Uchis'), ['Tyler, The Creator', 'Kali Uchis']);
  });

  test('splitArtists() sin artista ni repetidos', () => {
    assert.deepEqual(splitArtists(''), []);
    assert.deepEqual(splitArtists(undefined), []);
    assert.deepEqual(splitArtists('Farruko, FARRUKO'), ['Farruko']);
  });
});
