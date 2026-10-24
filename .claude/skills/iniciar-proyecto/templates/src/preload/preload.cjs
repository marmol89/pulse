const { contextBridge, ipcRenderer } = require('electron');

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

  // Conexión S3 (la clave secreta nunca vuelve a la ventana)
  getConnection: () => ipcRenderer.invoke('connection:get'),
  saveConnection: (input) => ipcRenderer.invoke('connection:save', input),
  importCredentials: () => ipcRenderer.invoke('connection:import'),

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
