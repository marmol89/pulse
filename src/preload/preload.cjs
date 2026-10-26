const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Escucha un aviso del main; devuelve la función para dejar de escuchar. */
const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

/** Única puerta del renderer al proceso main (contextIsolation + sandbox). */
contextBridge.exposeInMainWorld('api', {
  // Biblioteca (en el bucket S3)
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  syncLibrary: () => ipcRenderer.invoke('library:sync'),
  /** ¿Sigue la pista en el bucket? */
  verifyTrack: (id) => ipcRenderer.invoke('library:verify', id),
  /** Pistas nuevas, cambiadas o borradas en el bucket. */
  onLibraryChanged: subscribe('library:changed'),
  /** Elige canciones del ordenador y las sube al bucket. null si se cancela. */
  chooseUploads: () => ipcRenderer.invoke('library:choose-uploads'),
  /** Sube archivos o carpetas (rutas absolutas) al bucket. */
  uploadPaths: (paths) => ipcRenderer.invoke('library:upload', paths),
  /** Ruta en disco de un File arrastrado a la ventana ('' si no viene de un archivo). */
  pathForFile: (file) => webUtils.getPathForFile(file),
  /** Progreso de una subida ({ current, total, name }). */
  onUploadProgress: subscribe('library:upload-progress'),

  // Papelera del bucket. Devuelven { ok, ... } o { ok: false, error }.
  /** Mueve una canción a la papelera del bucket (desaparece de la biblioteca). */
  trashTrack: (id) => ipcRenderer.invoke('trash:move', id),
  getTrash: () => ipcRenderer.invoke('trash:list'),
  restoreFromTrash: (key) => ipcRenderer.invoke('trash:restore', key),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),

  // Conexión S3 (la clave secreta nunca vuelve a la ventana)
  getConnection: () => ipcRenderer.invoke('connection:get'),
  saveConnection: (input) => ipcRenderer.invoke('connection:save', input),
  importCredentials: () => ipcRenderer.invoke('connection:import'),

  // Carpetas del equipo, en vez del bucket (de solo lectura)
  /** Elige una carpeta en el diálogo del sistema: { id, name } o null si se cancela. */
  chooseFolder: () => ipcRenderer.invoke('folders:choose'),
  /** Usa esas carpetas (sus ids) en vez del bucket: { ok, summary, count } o { ok: false, error }. */
  saveFolders: (ids) => ipcRenderer.invoke('folders:save', ids),

  // Listas de canciones (compartidas por todos los Pulse del mismo bucket). Devuelven { ok, lists, id? } o { ok: false, error }.
  getLists: () => ipcRenderer.invoke('lists:get'),
  createList: (name, paths) => ipcRenderer.invoke('lists:create', name, paths),
  renameList: (id, name) => ipcRenderer.invoke('lists:rename', id, name),
  addToList: (id, paths) => ipcRenderer.invoke('lists:add', id, paths),
  moveInList: (id, path, to) => ipcRenderer.invoke('lists:move-track', id, path, to),
  removeFromList: (id, path) => ipcRenderer.invoke('lists:remove-track', id, path),
  deleteList: (id) => ipcRenderer.invoke('lists:delete', id),
  // Listas M3U: guardar el texto en un archivo / leer uno (diálogos del sistema). { saved, error? } y { name, text } | { error } | null.
  exportPlaylist: (name, text) => ipcRenderer.invoke('playlists:export', name, text),
  importPlaylist: () => ipcRenderer.invoke('playlists:import'),
  /** Listas cambiadas desde otro equipo. */
  onListsChanged: subscribe('lists:changed'),

  // Favoritos (compartidos como las listas). Las rutas, las más recientes primero; devuelven { ok, favorites } o { ok: false, error }.
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  setFavorite: (path, favorite) => ipcRenderer.invoke('favorites:set', path, favorite),
  /** Sube los favoritos que solo estaban en este equipo (de antes de compartirse). */
  importFavorites: (paths) => ipcRenderer.invoke('favorites:import', paths),
  /** Favoritos cambiados desde otro equipo. */
  onFavoritesChanged: subscribe('favorites:changed'),

  // Recientes (compartidos como los favoritos): las rutas, la última que sonó primero.
  getRecents: () => ipcRenderer.invoke('recents:get'),
  addRecent: (path) => ipcRenderer.invoke('recents:add', path),
  importRecents: (paths) => ipcRenderer.invoke('recents:import', paths),
  onRecentsChanged: subscribe('recents:changed'),

  // Escuchas (compartidas como los recientes): { ruta: veces que ha sonado }.
  getPlays: () => ipcRenderer.invoke('plays:get'),
  addPlay: (path) => ipcRenderer.invoke('plays:add', path),
  onPlaysChanged: subscribe('plays:changed'),

  // Bandeja del sistema y barra de tareas (solo escritorio).
  desktop: {
    update: (state) => ipcRenderer.send('desktop:update', state),
    setCloseToTray: (enabled) => ipcRenderer.send('desktop:close-to-tray', enabled),
    setMini: (enabled) => ipcRenderer.send('desktop:mini', enabled),
    /** Actualización: { state: 'unavailable' | 'idle' | 'ready', version }; 'ready' = descargada, se instala al cerrar. */
    updateStatus: () => ipcRenderer.invoke('desktop:update-status'),
    installUpdate: () => ipcRenderer.send('desktop:install-update'),
    onUpdateStatus: subscribe('desktop:update-changed'),
    /** 'toggle', 'next' o 'previous' desde la bandeja o la miniatura. */
    onCommand: subscribe('desktop:command'),
  },

  // Datos de internet (carátulas, álbum, año, género, letra)
  lookupTrack: (id, options) => ipcRenderer.invoke('metadata:lookup', id, options),
  /** "Editar datos" (`changes`: el formulario; null: restaurar los del archivo) → { ok, track } | { ok: false, error }. */
  editTrack: (id, changes) => ipcRenderer.invoke('metadata:edit', id, changes),
  setOnlineLookup: (enabled) => ipcRenderer.invoke('metadata:set-enabled', enabled),
  /** Fotos de artista ya guardadas ({ nombre: URL }); las que faltan se buscan y llegan con onArtistPicturesChanged. */
  getArtistPictures: (names) => ipcRenderer.invoke('artists:pictures', names),
  onArtistPicturesChanged: subscribe('artists:pictures-changed'),
  /** Pistas completadas en segundo plano. */
  onTracksUpdated: subscribe('library:tracks-updated'),
});
