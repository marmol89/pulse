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

  test('persiste entre instancias', () => {
    const storage = memoryStorage();
    new Favorites(storage).toggle('/a.mp3');
    assert.equal(new Favorites(storage).has('/a.mp3'), true);
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

  test('persiste entre instancias', () => {
    const storage = memoryStorage();
    new Recents(storage).add('/a.mp3');
    assert.deepEqual(new Recents(storage).list(), ['/a.mp3']);
  });
});
