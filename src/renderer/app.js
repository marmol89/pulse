import { PlayerMediator } from './mediator/PlayerMediator.js';
import { EVENTS } from './mediator/events.js';
import { createStorage } from './lib/storage.js';
import { AudioEngine } from './colleagues/AudioEngine.js';
import { Playlist } from './colleagues/Playlist.js';
import { Catalog } from './colleagues/Catalog.js';
import { Favorites } from './colleagues/Favorites.js';
import { Recents } from './colleagues/Recents.js';
import { Lists } from './colleagues/Lists.js';
import { Settings } from './colleagues/Settings.js';
import { LibraryService } from './colleagues/LibraryService.js';
import { MediaSessionBridge } from './colleagues/MediaSessionBridge.js';
import { Router } from './colleagues/Router.js';
import { HomeView } from './colleagues/HomeView.js';
import { SearchView } from './colleagues/SearchView.js';
import { PlaylistView } from './colleagues/PlaylistView.js';
import { NowPlayingView } from './colleagues/NowPlayingView.js';
import { ControlsView } from './colleagues/ControlsView.js';
import { ToastView } from './colleagues/ToastView.js';
import { ConnectionView } from './colleagues/ConnectionView.js';
import { ListDialog } from './colleagues/ListDialog.js';
import { KeyboardShortcuts } from './colleagues/KeyboardShortcuts.js';

/** Raíz de composición: crea los colegas, los conecta con el mediator y arranca la app. */
const storage = createStorage(window.localStorage);
const $ = (selector) => document.querySelector(selector);

const mediator = new PlayerMediator({
  // Modelos y servicios
  audio: new AudioEngine(new Audio(), storage, undefined, { standby: new Audio() }),
  playlist: new Playlist(),
  catalog: new Catalog(),
  favorites: new Favorites(storage),
  recents: new Recents(storage),
  lists: new Lists(),
  settings: new Settings(storage),
  library: new LibraryService(window.api),
  mediaSession: new MediaSessionBridge(),
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
  keyboard: new KeyboardShortcuts(window),
});

mediator.notify(null, EVENTS.APP_READY);
