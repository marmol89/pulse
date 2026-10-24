const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Única puerta del renderer al proceso main (contextIsolation + sandbox). */
contextBridge.exposeInMainWorld('api', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  chooseFiles: () => ipcRenderer.invoke('library:choose-files'),
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  importPaths: (paths) => ipcRenderer.invoke('library:import', paths),
  // Ruta real de un archivo arrastrado a la ventana (File.path ya no existe en Electron).
  pathForFile: (file) => webUtils.getPathForFile(file),
  /** ¿Sigue el archivo de la pista en el disco? */
  verifyTrack: (path) => ipcRenderer.invoke('library:verify', path),
  /** Archivos que desaparecen o vuelven con la app abierta. Devuelve la función para dejar de escuchar. */
  onLibraryChanged: (callback) => {
    const listener = (_event, change) => callback(change);
    ipcRenderer.on('library:changed', listener);
    return () => ipcRenderer.removeListener('library:changed', listener);
  },

  // Datos de internet (carátulas, álbum, año, género, letra)
  lookupTrack: (path, options) => ipcRenderer.invoke('metadata:lookup', path, options),
  setOnlineLookup: (enabled) => ipcRenderer.invoke('metadata:set-enabled', enabled),
  /** Pistas completadas en segundo plano. Devuelve la función para dejar de escuchar. */
  onTracksUpdated: (callback) => {
    const listener = (_event, tracks) => callback(tracks);
    ipcRenderer.on('library:tracks-updated', listener);
    return () => ipcRenderer.removeListener('library:tracks-updated', listener);
  },
});
