/**
 * Catálogo único de eventos. Los colegas solo emiten estos nombres.
 * Entre paréntesis, el payload de cada evento.
 */
export const EVENTS = Object.freeze({
  // Ciclo de vida
  APP_READY: 'app-ready', // ()

  // Reproducción
  PLAY_TOGGLE: 'play-toggle', // ()
  SEEK: 'seek', // (segundos)
  SEEK_STEP: 'seek-step', // (±segundos)
  VOLUME_CHANGE: 'volume-change', // (0..1)
  VOLUME_STEP: 'volume-step', // (±0..1)
  TOGGLE_MUTE: 'toggle-mute', // ()
  TIME_UPDATE: 'time-update', // ({ current, duration })
  STATE_CHANGE: 'state-change', // ({ playing })
  TRACK_STARTED: 'track-started', // ()
  ERROR: 'error', // ({ message })

  // Salida de audio ("Altavoz de la sala")
  SHOW_OUTPUT_DEVICES: 'show-output-devices', // ()
  OUTPUT_DEVICE_CHANGE: 'output-device-change', // (deviceId)

  // Navegación entre pistas
  NEXT: 'next', // ()
  PREVIOUS: 'previous', // ()
  TRACK_SELECTED: 'track-selected', // ({ source, path })
  PLAY_COLLECTION: 'play-collection', // (source)
  ENDED: 'ended', // ()

  // Modos
  TOGGLE_SHUFFLE: 'toggle-shuffle', // ()
  CYCLE_REPEAT: 'cycle-repeat', // ()
  PLAY_MIX: 'play-mix', // ()

  // Biblioteca (en el bucket S3)
  SYNC_LIBRARY: 'sync-library', // () — "Actualizar biblioteca"
  LIBRARY_CHANGED: 'library-changed', // ({ removed: id[], added: Track[] }) — cambios en el bucket

  // Subir canciones del ordenador al bucket
  UPLOAD_SONGS: 'upload-songs', // () — "Subir canciones": elegirlas en un diálogo
  FILES_DROPPED: 'files-dropped', // (File[]) — archivos o carpetas arrastrados a la ventana
  UPLOAD_PROGRESS: 'upload-progress', // ({ current, total, name }) — subiendo la canción current de total

  // Conexión S3
  OPEN_CONNECTION: 'open-connection', // ()
  SAVE_CONNECTION: 'save-connection', // ({ endpoint, accessKeyId, secretAccessKey, bucket, prefix })
  IMPORT_CREDENTIALS: 'import-credentials', // () — elegir un credentials.json

  // Vistas
  NAVIGATE: 'navigate', // ('home' | 'search' | 'library')
  NAVIGATE_BACK: 'navigate-back', // ()
  OPEN_COLLECTION: 'open-collection', // (source)
  OPEN_NOW_PLAYING: 'open-now-playing', // ()
  CLOSE_NOW_PLAYING: 'close-now-playing', // ()
  SEARCH: 'search', // (texto)

  // Favoritos
  TOGGLE_FAVORITE: 'toggle-favorite', // (path?) — sin path, la pista actual

  // Listas de canciones del usuario (en el bucket, compartidas con todos los Pulse conectados a él)
  LISTS_CHANGED: 'lists-changed', // (List[]) — llegaron cambios de otro equipo
  NEW_LIST: 'new-list', // (paths?) — "Nueva lista": pedir el nombre (con esas canciones dentro)
  CREATE_LIST: 'create-list', // ({ name, paths })
  CHOOSE_LIST: 'choose-list', // (path?) — "Añadir a una lista": sin path, la pista actual
  ADD_TO_LIST: 'add-to-list', // ({ id, paths })
  REMOVE_FROM_LIST: 'remove-from-list', // ({ id, path })
  EDIT_LIST: 'edit-list', // (id) — "Editar lista": renombrar o eliminar
  RENAME_LIST: 'rename-list', // ({ id, name })
  DELETE_LIST: 'delete-list', // (id)

  // Datos de internet (carátula, álbum, año, género, letra)
  SET_ONLINE_LOOKUP: 'set-online-lookup', // (activado)
  LOOKUP_TRACK: 'lookup-track', // (path) — búsqueda pedida por el usuario
  TRACKS_UPDATED: 'tracks-updated', // (Track[]) — completadas en segundo plano
});
