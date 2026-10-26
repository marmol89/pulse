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
  SORT_LIBRARY: 'sort-library', // (orden: 'added' | 'title' | 'artist' | 'album' | 'year')
  FILTER_LIBRARY: 'filter-library', // (texto) — filtra "Tu biblioteca" que se está viendo
  ENDED: 'ended', // () — con fundido, unos segundos antes del final
  NEAR_END: 'near-end', // () — quedan 20 s: momento de precargar la siguiente

  // Temporizador de apagado
  SET_SLEEP_TIMER: 'set-sleep-timer', // (minutos | 'track' | null) — null lo desactiva
  SLEEP_TIMER_ENDED: 'sleep-timer-ended', // ()
  // Cola editable ("⋯" de cada fila y "Ver la cola")
  PLAY_NEXT: 'play-next', // (paths[]) — "Reproducir a continuación"
  ENQUEUE: 'enqueue', // (paths[]) — "Añadir a la cola"
  REMOVE_FROM_QUEUE: 'remove-from-queue', // (path)
  MOVE_IN_QUEUE: 'move-in-queue', // ({ path, to }) — arrastrar en "Ver la cola" (to: posición final)

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

  // Conexión: el bucket S3 o carpetas del equipo (nunca las dos a la vez)
  OPEN_CONNECTION: 'open-connection', // ()
  SAVE_CONNECTION: 'save-connection', // ({ endpoint, accessKeyId, secretAccessKey, bucket, prefix })
  IMPORT_CREDENTIALS: 'import-credentials', // () — elegir un credentials.json
  CHOOSE_FOLDER: 'choose-folder', // () — "Añadir carpeta": elegirla en el selector del sistema
  SAVE_FOLDERS: 'save-folders', // (ids[]) — usar esas carpetas en vez del bucket

  // Vistas
  NAVIGATE: 'navigate', // ('home' | 'search' | 'library')
  NAVIGATE_BACK: 'navigate-back', // ()
  OPEN_COLLECTION: 'open-collection', // (source)
  OPEN_NOW_PLAYING: 'open-now-playing', // ()
  CLOSE_NOW_PLAYING: 'close-now-playing', // ()
  SEARCH: 'search', // (texto)

  // Favoritos
  TOGGLE_FAVORITE: 'toggle-favorite', // (path?) — sin path, la pista actual
  FAVORITES_CHANGED: 'favorites-changed', // (paths[]) — llegaron cambios de otro equipo (las más recientes primero)

  // Escuchado recientemente (en el bucket, como los favoritos)
  RECENTS_CHANGED: 'recents-changed', // (paths[]) — llegaron cambios de otro equipo (la última que sonó primero)

  // Escuchas de cada canción (en el bucket) para "Más escuchadas" y "Sin escuchar"
  PLAYS_CHANGED: 'plays-changed', // ({ ruta: escuchas }) — llegaron cambios de otro equipo

  // Papelera del bucket ("Eliminar del bucket" en el "⋯" de cada fila y "Papelera" en Tu música)
  TRASH_TRACK: 'trash-track', // (path) — pide confirmación
  CONFIRM_TRASH: 'confirm-trash', // (path) — la mueve a la papelera
  OPEN_TRASH: 'open-trash', // ()
  RESTORE_FROM_TRASH: 'restore-from-trash', // (key) — clave del objeto en la papelera
  EMPTY_TRASH: 'empty-trash', // () — borra para siempre lo que hay en ella

  // Descargas para escuchar sin conexión (solo Android)
  DOWNLOAD_COLLECTION: 'download-collection', // (source)
  REMOVE_DOWNLOADS: 'remove-downloads', // (source)
  CLEAR_DOWNLOADS: 'clear-downloads', // ()
  DOWNLOADS_CHANGED: 'downloads-changed', // ({ paths, pending, bytes }) — terminó una descarga

  // Listas de canciones del usuario (en el bucket, compartidas con todos los Pulse conectados a él)
  LISTS_CHANGED: 'lists-changed', // (List[]) — llegaron cambios de otro equipo
  NEW_LIST: 'new-list', // (paths?) — "Nueva lista": pedir el nombre (con esas canciones dentro)
  CREATE_LIST: 'create-list', // ({ name, paths })
  CHOOSE_LIST: 'choose-list', // (path?) — "Añadir a una lista": sin path, la pista actual
  ADD_TO_LIST: 'add-to-list', // ({ id, paths })
  REMOVE_FROM_LIST: 'remove-from-list', // ({ id, path })
  MOVE_IN_LIST: 'move-in-list', // ({ id, path, to }) — arrastrar una canción (to: posición final)
  EDIT_LIST: 'edit-list', // (id) — "Editar lista": renombrar o eliminar
  RENAME_LIST: 'rename-list', // ({ id, name })
  DELETE_LIST: 'delete-list', // (id)
  EXPORT_COLLECTION: 'export-collection', // (source) — guardar una colección como lista M3U (.m3u8)
  IMPORT_LIST: 'import-list', // () — crear una lista desde un archivo M3U con las canciones que estén en la biblioteca

  // Datos de internet (carátula, álbum, año, género, letra)
  SET_ONLINE_LOOKUP: 'set-online-lookup', // (activado)
  SET_CROSSFADE: 'set-crossfade', // (segundos: 0 = sin fundido)
  SET_LOUDNESS: 'set-loudness', // ('off' | 'track' | 'album') — volumen uniforme con ReplayGain

  // Bandeja del sistema y mini-reproductor (solo escritorio)
  SET_CLOSE_TO_TRAY: 'set-close-to-tray', // (activado) — al cerrar la ventana, seguir sonando en la bandeja
  TOGGLE_MINI_PLAYER: 'toggle-mini-player', // () — ventana pequeña y siempre encima, o volver

  // Ecualizador (solo escritorio: Web Audio)
  OPEN_EQUALIZER: 'open-equalizer', // ()
  SET_EQUALIZER_PRESET: 'set-equalizer-preset', // (nombre: 'flat' | 'bass' | 'vocal' | 'treble' | 'acoustic' | 'electronic')
  SET_EQUALIZER_BAND: 'set-equalizer-band', // ({ index, gain }) — gain en dB, de −12 a 12
  LOOKUP_TRACK: 'lookup-track', // (path) — búsqueda pedida por el usuario
  TRACKS_UPDATED: 'tracks-updated', // (Track[]) — completadas en segundo plano
  ARTIST_PICTURES_CHANGED: 'artist-pictures-changed', // ({ nombre: URL }) — fotos de artista nuevas
});
