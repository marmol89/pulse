export const EVENTS = Object.freeze({
  // Reproducción
  PLAY_TOGGLE: 'play-toggle',
  SEEK: 'seek',
  VOLUME_CHANGE: 'volume-change',
  OUTPUT_DEVICE_CHANGE: 'output-device-change',
  TIME_UPDATE: 'time-update',
  STATE_CHANGE: 'state-change',
  TRACK_STARTED: 'track-started',
  ERROR: 'error',

  // Navegación entre pistas
  NEXT: 'next',
  PREVIOUS: 'previous',
  TRACK_SELECTED: 'track-selected',
  ENDED: 'ended',

  // Modos
  TOGGLE_SHUFFLE: 'toggle-shuffle',
  CYCLE_REPEAT: 'cycle-repeat',
  PLAY_MIX: 'play-mix',

  // Biblioteca
  OPEN_FILES: 'open-files',
  OPEN_FOLDER: 'open-folder',

  // Vistas
  NAVIGATE: 'navigate',
  OPEN_NOW_PLAYING: 'open-now-playing',
  CLOSE_NOW_PLAYING: 'close-now-playing',
  FILTER_CHANGE: 'filter-change',
  SEARCH: 'search',

  // Favoritos
  TOGGLE_FAVORITE: 'toggle-favorite',
});
