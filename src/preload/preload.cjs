const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Única puerta del renderer al proceso main (contextIsolation + sandbox). */
contextBridge.exposeInMainWorld('api', {
  // Biblioteca (en el bucket S3)
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  syncLibrary: () => ipcRenderer.invoke('library:sync'),
  /** ¿Sigue la pista en el bucket? */
  verifyTrack: (id) => ipcRenderer.invoke('library:verify', id),
  /** Pistas nuevas, cambiadas o borradas en el bucket. Devuelve la función para dejar de escuchar. */
  onLibraryChanged: (callback) => {
    const listener = (_event, change) => callback(change);
    ipcRenderer.on('library:changed', listener);
    return () => ipcRenderer.removeListener('library:changed', listener);
  },
  /** Elige canciones del ordenador y las sube al bucket. null si se cancela. */
  chooseUploads: () => ipcRenderer.invoke('library:choose-uploads'),
  /** Sube archivos o carpetas (rutas absolutas) al bucket. */
  uploadPaths: (paths) => ipcRenderer.invoke('library:upload', paths),
  /** Ruta en disco de un File arrastrado a la ventana ('' si no viene de un archivo). */
  pathForFile: (file) => webUtils.getPathForFile(file),
  /** Progreso de una subida ({ current, total, name }). Devuelve la función para dejar de escuchar. */
  onUploadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('library:upload-progress', listener);
    return () => ipcRenderer.removeListener('library:upload-progress', listener);
  },

  // Conexión S3 (la clave secreta nunca vuelve a la ventana)
  getConnection: () => ipcRenderer.invoke('connection:get'),
  saveConnection: (input) => ipcRenderer.invoke('connection:save', input),
  importCredentials: () => ipcRenderer.invoke('connection:import'),

  // Listas de canciones (compartidas por todos los Pulse del mismo bucket). Devuelven { ok, lists, id? } o { ok: false, error }.
  getLists: () => ipcRenderer.invoke('lists:get'),
  createList: (name, paths) => ipcRenderer.invoke('lists:create', name, paths),
  renameList: (id, name) => ipcRenderer.invoke('lists:rename', id, name),
  addToList: (id, paths) => ipcRenderer.invoke('lists:add', id, paths),
  removeFromList: (id, path) => ipcRenderer.invoke('lists:remove-track', id, path),
  deleteList: (id) => ipcRenderer.invoke('lists:delete', id),
  /** Listas cambiadas desde otro equipo. Devuelve la función para dejar de escuchar. */
  onListsChanged: (callback) => {
    const listener = (_event, lists) => callback(lists);
    ipcRenderer.on('lists:changed', listener);
    return () => ipcRenderer.removeListener('lists:changed', listener);
  },

  // Favoritos (compartidos como las listas). Las rutas, las más recientes primero; devuelven { ok, favorites } o { ok: false, error }.
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  setFavorite: (path, favorite) => ipcRenderer.invoke('favorites:set', path, favorite),
  /** Sube los favoritos que solo estaban en este equipo (de antes de compartirse). */
  importFavorites: (paths) => ipcRenderer.invoke('favorites:import', paths),
  /** Favoritos cambiados desde otro equipo. Devuelve la función para dejar de escuchar. */
  // Recientes (compartidos como los favoritos): las rutas, la última que sonó primero.
  getRecents: () => ipcRenderer.invoke('recents:get'),
  addRecent: (path) => ipcRenderer.invoke('recents:add', path),
  importRecents: (paths) => ipcRenderer.invoke('recents:import', paths),
  onRecentsChanged: (callback) => {
    const listener = (_event, recents) => callback(recents);
    ipcRenderer.on('recents:changed', listener);
    return () => ipcRenderer.removeListener('recents:changed', listener);
  },
  onFavoritesChanged: (callback) => {
    const listener = (_event, favorites) => callback(favorites);
    ipcRenderer.on('favorites:changed', listener);
    return () => ipcRenderer.removeListener('favorites:changed', listener);
  },

  // Datos de internet (carátulas, álbum, año, género, letra)
  lookupTrack: (id, options) => ipcRenderer.invoke('metadata:lookup', id, options),
  setOnlineLookup: (enabled) => ipcRenderer.invoke('metadata:set-enabled', enabled),
  /** Pistas completadas en segundo plano. Devuelve la función para dejar de escuchar. */
  onTracksUpdated: (callback) => {
    const listener = (_event, tracks) => callback(tracks);
    ipcRenderer.on('library:tracks-updated', listener);
    return () => ipcRenderer.removeListener('library:tracks-updated', listener);
  },
});
