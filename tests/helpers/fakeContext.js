import { mock } from 'node:test';
import { Playlist } from '../../src/renderer/colleagues/Playlist.js';
import { Catalog } from '../../src/renderer/colleagues/Catalog.js';
import { Favorites } from '../../src/renderer/colleagues/Favorites.js';
import { Recents } from '../../src/renderer/colleagues/Recents.js';
import { Settings } from '../../src/renderer/colleagues/Settings.js';
import { Lists } from '../../src/renderer/colleagues/Lists.js';
import { SleepTimer } from '../../src/renderer/colleagues/SleepTimer.js';
import { Session } from '../../src/renderer/colleagues/Session.js';
import { Downloads } from '../../src/renderer/colleagues/Downloads.js';
import { Plays } from '../../src/renderer/colleagues/Plays.js';
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
    plays: new Plays(),
    lists: new Lists(),
    settings: new Settings(storage),
    downloads: new Downloads(),
    session: new Session(storage),
    library: spy({ load: [], sync: { added: 0, removed: 0 }, verify: true, connection: null, importCredentials: null, lookup: null, canDownload: false, lists: [], favorites: [], setFavorite: { ok: true, favorites: [] }, importFavorites: { ok: true, favorites: [] }, recents: [], addRecent: { ok: true, recents: [] }, importRecents: { ok: true, recents: [] }, plays: {}, addPlay: { ok: true, plays: {} }, exportPlaylist: { saved: true }, importPlaylist: null }),
    mediaSession: spy(),
    desktop: spy({ available: false }),
    equalizer: spy({ available: false, setOutputDevice: async () => {} }),
    equalizerDialog: spy(),
    sleepTimer: new SleepTimer({ timers: { setTimeout: () => 1, clearTimeout() {} }, now: () => 0 }),
    router: spy(),
    trashDialog: spy(),
    home: spy(),
    search: spy(),
    playlistView: spy({ source: null }),
    nowPlaying: spy(),
    controls: spy(),
    toast: spy(),
    connection: spy(),
    listDialog: spy(),
    ...overrides,
  };
}
