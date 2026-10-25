import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Favorites } from '../../src/renderer/colleagues/Favorites.js';
import { Recents } from '../../src/renderer/colleagues/Recents.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';

const memoryStorage = () => createStorage(createMemoryBackend());

describe('Favorites', () => {
  test('toggle() marca y desmarca y devuelve el estado final', () => {
    const favorites = new Favorites(memoryStorage());
    assert.equal(favorites.toggle('/a.mp3'), true);
    assert.equal(favorites.has('/a.mp3'), true);
    assert.equal(favorites.toggle('/a.mp3'), false);
    assert.equal(favorites.has('/a.mp3'), false);
  });

  test('list() devuelve primero las más recientes', () => {
    const favorites = new Favorites(memoryStorage());
    favorites.toggle('/a.mp3');
    favorites.toggle('/b.mp3');
    assert.deepEqual(favorites.list(), ['/b.mp3', '/a.mp3']);
  });

  test('set() toma la copia recibida (las más recientes primero) y dice qué rutas cambiaron', () => {
    const favorites = new Favorites(memoryStorage());
    favorites.toggle('/a.mp3');
    favorites.toggle('/b.mp3');
    assert.deepEqual(favorites.set(['/c.mp3', '/b.mp3']), ['/a.mp3', '/c.mp3']);
    assert.deepEqual(favorites.list(), ['/c.mp3', '/b.mp3']);
    assert.deepEqual(favorites.set(['/c.mp3', '/b.mp3']), []);
  });

  test('los de cuando solo eran de este equipo se ven hasta subirlos; después se olvidan', () => {
    const storage = createStorage(createMemoryBackend({ 'pulse.favorites': JSON.stringify(['/a.mp3', '/b.mp3']) }));
    const favorites = new Favorites(storage);
    assert.deepEqual(favorites.list(), ['/b.mp3', '/a.mp3']);
    assert.deepEqual(favorites.legacy(), ['/a.mp3', '/b.mp3']);
    favorites.toggle('/c.mp3');
    assert.deepEqual(new Favorites(storage).legacy(), ['/a.mp3', '/b.mp3'], 'el corazón ya no se guarda aquí');
    favorites.forgetLegacy();
    assert.deepEqual(new Favorites(storage).legacy(), []);
  });
});

describe('Recents', () => {
  test('add() pone la ruta al principio sin duplicados', () => {
    const recents = new Recents(memoryStorage());
    recents.add('/a.mp3');
    recents.add('/b.mp3');
    recents.add('/a.mp3');
    assert.deepEqual(recents.list(), ['/a.mp3', '/b.mp3']);
  });

  test('guarda como máximo 12 rutas', () => {
    const recents = new Recents(memoryStorage());
    for (let i = 0; i < 15; i += 1) recents.add(`/${i}.mp3`);
    assert.equal(recents.list().length, 12);
    assert.equal(recents.list()[0], '/14.mp3');
  });

  test('los de antes (solo de este equipo) se ven hasta recibir los del bucket y se pueden olvidar', () => {
    const storage = memoryStorage();
    storage.set('recents', ['/b.mp3', '/a.mp3']); // la más reciente primero, como se guardaban
    const recents = new Recents(storage);
    assert.deepEqual(recents.list(), ['/b.mp3', '/a.mp3']);
    assert.deepEqual(recents.legacy(), ['/a.mp3', '/b.mp3'], 'para subir: de la más antigua a la más reciente');
    recents.forgetLegacy();
    recents.set(['/c.mp3']);
    assert.deepEqual(recents.list(), ['/c.mp3']);
    assert.deepEqual(new Recents(storage).list(), []);
  });
});
