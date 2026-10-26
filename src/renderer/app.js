import { PlayerMediator } from './mediator/PlayerMediator.js';
import { EVENTS } from './mediator/events.js';
import { createStorage } from './lib/storage.js';
import { AudioEngine } from './colleagues/AudioEngine.js';
import { Equalizer } from './colleagues/Equalizer.js';
import { Playlist } from './colleagues/Playlist.js';
import { Catalog } from './colleagues/Catalog.js';
import { Favorites } from './colleagues/Favorites.js';
import { Recents } from './colleagues/Recents.js';
import { Plays } from './colleagues/Plays.js';
import { Lists } from './colleagues/Lists.js';
import { Settings } from './colleagues/Settings.js';
import { Downloads } from './colleagues/Downloads.js';
import { Session } from './colleagues/Session.js';
import { LibraryService } from './colleagues/LibraryService.js';
import { MediaSessionBridge } from './colleagues/MediaSessionBridge.js';
import { SleepTimer } from './colleagues/SleepTimer.js';
import { Router } from './colleagues/Router.js';
import { HomeView } from './colleagues/HomeView.js';
import { SearchView } from './colleagues/SearchView.js';
import { PlaylistView } from './colleagues/PlaylistView.js';
import { NowPlayingView } from './colleagues/NowPlayingView.js';
import { ControlsView } from './colleagues/ControlsView.js';
import { ToastView } from './colleagues/ToastView.js';
import { ConnectionView } from './colleagues/ConnectionView.js';
import { ListDialog } from './colleagues/ListDialog.js';
import { TrashDialog } from './colleagues/TrashDialog.js';
import { EqualizerDialog } from './colleagues/EqualizerDialog.js';
import { KeyboardShortcuts } from './colleagues/KeyboardShortcuts.js';

/** Raíz de composición: crea los colegas, los conecta con el mediator y arranca la app. */
const storage = createStorage(window.localStorage);
const $ = (selector) => document.querySelector(selector);
// Los dos <audio> de AudioEngine (sin cortes y fundido). En escritorio pasan por el ecualizador: media:// admite
// CORS y sin crossOrigin Web Audio solo daría silencio. En Android no (URLs firmadas de otro origen).
const webAudio = document.documentElement.dataset.platform !== 'android' && typeof window.AudioContext === 'function';
const players = [new Audio(), new Audio()];
if (webAudio) for (const player of players) player.crossOrigin = 'anonymous';

const mediator = new PlayerMediator({
  // Modelos y servicios
  audio: new AudioEngine(players[0], storage, undefined, { standby: players[1] }),
  equalizer: new Equalizer(players, storage, { available: webAudio }),
  playlist: new Playlist(),
  catalog: new Catalog(),
  favorites: new Favorites(storage),
  recents: new Recents(storage),
  plays: new Plays(),
  lists: new Lists(),
  settings: new Settings(storage),
  downloads: new Downloads(),
  session: new Session(storage),
  library: new LibraryService(window.api),
  mediaSession: new MediaSessionBridge(),
  sleepTimer: new SleepTimer(),
  // Vistas
  router: new Router($('#app')),
  home: new HomeView($('#view-home')),
  search: new SearchView($('#view-search')),
  playlistView: new PlaylistView($('#view-collection')),
  nowPlaying: new NowPlayingView($('#now-playing')),
  controls: new ControlsView($('#player-bar')),
  toast: new ToastView($('#toast')),
  connection: new ConnectionView($('#connection')),
  listDialog: new ListDialog($('#list-dialog')),
  trashDialog: new TrashDialog($('#trash-dialog')),
  equalizerDialog: new EqualizerDialog($('#equalizer-dialog')),
  keyboard: new KeyboardShortcuts(window),
});

mediator.notify(null, EVENTS.APP_READY);
