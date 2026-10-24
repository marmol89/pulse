import { mock } from 'node:test';
import { Playlist } from '../../src/renderer/colleagues/Playlist.js';
import { Catalog } from '../../src/renderer/colleagues/Catalog.js';
import { Favorites } from '../../src/renderer/colleagues/Favorites.js';
import { Recents } from '../../src/renderer/colleagues/Recents.js';
import { Settings } from '../../src/renderer/colleagues/Settings.js';
import { createStorage, createMemoryBackend } from '../../src/renderer/lib/storage.js';

/**
 * Objeto espía: cualquier método existe y registra sus llamadas.
 * `returns` fija lo que devuelve cada método (valor o implementación).
 */
export function spy(returns = {}) {
  const fns = new Map();
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        if (!fns.has(prop)) {
          const value = returns[prop];
          fns.set(prop, mock.fn(typeof value === 'function' ? value : () => value));
        }
        return fns.get(prop);
      },
    },
  );
}

/** Argumentos de cada llamada a un método espía. */
export const callsOf = (fn) => fn.mock.calls.map((call) => call.arguments);

/**
 * Contexto falso para probar handlers sin instanciar el mediator.
 * Los modelos son reales (puros y ya probados); servicios y vistas son espías.
 */
export function fakeContext(overrides = {}) {
  const storage = createStorage(createMemoryBackend());
  return {
    audio: spy({
      hasTrack: false,
      isPlaying: false,
      currentTime: 0,
      volume: 0.8,
      isMuted: false,
      consecutiveErrors: 0,
      outputDevices: [],
      outputDevice: '',
    }),
    playlist: new Playlist({ random: () => 0 }),
    catalog: new Catalog(),
    favorites: new Favorites(storage),
    recents: new Recents(storage),
    settings: new Settings(storage),
    library: spy({ load: [], chooseFiles: [], chooseFolder: null, import: [], pathsForFiles: [], lookup: null, verify: true }),
    mediaSession: spy(),
    router: spy(),
    home: spy(),
    search: spy(),
    playlistView: spy({ source: null }),
    nowPlaying: spy(),
    controls: spy(),
    toast: spy(),
    ...overrides,
  };
}
