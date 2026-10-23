import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  simplify,
  similarity,
  artistSimilarity,
  parseFileName,
  isTitleFromFile,
  queryFromRecord,
  pickBest,
} from '../../../src/main/online/matching.js';

const candidate = (fields) => ({ title: '', artist: '', duration: 0, ...fields });

describe('online/matching', () => {
  test('simplify() quita tildes, signos, paréntesis, corchetes y "feat."', () => {
    assert.equal(simplify('Canción (Remastered 2011)'), 'cancion');
    assert.equal(simplify('Despacito [Live] feat. Justin Bieber'), 'despacito');
    assert.equal(simplify("Don't Stop Me Now!"), 'don t stop me now');
  });

  test('similarity() es 1 con títulos equivalentes y baja con títulos distintos', () => {
    assert.equal(similarity('Luces de Neón', 'luces de neon'), 1);
    assert.ok(similarity('Despacito', 'Despasito') > 0.7);
    assert.ok(similarity('Despacito', 'Bohemian Rhapsody') < 0.2);
    assert.equal(similarity('', 'algo'), 0);
  });

  test('artistSimilarity() reconoce al artista dentro de una colaboración', () => {
    assert.equal(artistSimilarity('Luis Fonsi', 'Luis Fonsi & Daddy Yankee'), 1);
    assert.equal(artistSimilarity('Bad Bunny', 'Bad Bunny x Jhay Cortez'), 1);
    assert.ok(artistSimilarity('Shakira', 'Rosalía') < 0.4);
  });

  test('parseFileName() separa artista y título y quita el número de pista', () => {
    assert.deepEqual(parseFileName('01. Luis Fonsi - Despacito'), { artist: 'Luis Fonsi', title: 'Despacito' });
    assert.deepEqual(parseFileName('07 - Queen - Bohemian Rhapsody'), { artist: 'Queen', title: 'Bohemian Rhapsody' });
    assert.deepEqual(parseFileName('Aurora_Vega_-_Luces_de_Neón'), { artist: 'Aurora Vega', title: 'Luces de Neón' });
    assert.deepEqual(parseFileName('03 Intro'), { artist: '', title: 'Intro' });
    assert.deepEqual(parseFileName('2Pac - Changes'), { artist: '2Pac', title: 'Changes' });
  });

  test('isTitleFromFile() usa la marca guardada o la deduce del nombre del archivo', () => {
    assert.equal(isTitleFromFile({ path: '/m/Despacito.mp3', title: 'Despacito', titleFromFile: false }), false);
    assert.equal(isTitleFromFile({ path: '/m/Despacito.mp3', title: 'Despacito' }), true);
    assert.equal(isTitleFromFile({ path: '/m/01.mp3', title: 'Despacito' }), false);
  });

  test('queryFromRecord() usa las etiquetas o, si no hay, el nombre del archivo', () => {
    const tagged = { path: '/m/x.mp3', title: 'Despacito', artist: 'Luis Fonsi', album: '', duration: 229, titleFromFile: false };
    assert.deepEqual(queryFromRecord(tagged), { title: 'Despacito', artist: 'Luis Fonsi', album: '', duration: 229 });

    const untagged = { path: '/m/Luis Fonsi - Despacito.mp3', title: 'Luis Fonsi - Despacito', artist: 'Artista desconocido', album: '', duration: 229, titleFromFile: true };
    assert.deepEqual(queryFromRecord(untagged), { title: 'Despacito', artist: 'Luis Fonsi', album: '', duration: 229 });
  });

  describe('pickBest()', () => {
    const despacito = candidate({ title: 'Despacito', artist: 'Luis Fonsi & Daddy Yankee', duration: 229.4 });
    const remix = candidate({ title: 'Despacito (Remix)', artist: 'Luis Fonsi, Daddy Yankee & Justin Bieber', duration: 281 });
    const cover = candidate({ title: 'Despacito', artist: 'Kidz Bop Kids', duration: 230 });

    test('elige la canción que encaja en título, artista y duración', () => {
      assert.equal(pickBest({ title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }, [cover, remix, despacito]), despacito);
    });

    test('descarta otra versión con una duración muy distinta', () => {
      assert.equal(pickBest({ title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }, [remix]), null);
    });

    test('descarta versiones de otros artistas', () => {
      assert.equal(pickBest({ title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }, [cover]), null);
    });

    test('sin artista solo acepta un título casi idéntico con la misma duración', () => {
      const intro = candidate({ title: 'Intro', artist: 'Cualquiera', duration: 95 });
      assert.equal(pickBest({ title: 'Intro', artist: '', duration: 0 }, [intro]), null);
      assert.equal(pickBest({ title: 'Intro', artist: '', duration: 60 }, [intro]), null);
      assert.equal(pickBest({ title: 'Intro', artist: '', duration: 94 }, [intro]), intro);
    });

    test('sin candidatos devuelve null', () => {
      assert.equal(pickBest({ title: 'Despacito', artist: 'Luis Fonsi', duration: 229 }, []), null);
    });
  });
});
