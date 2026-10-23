const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Única puerta del renderer al proceso main (contextIsolation + sandbox). */
contextBridge.exposeInMainWorld('api', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  chooseFiles: () => ipcRenderer.invoke('library:choose-files'),
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  importPaths: (paths) => ipcRenderer.invoke('library:import', paths),
  // Ruta real de un archivo arrastrado a la ventana (File.path ya no existe en Electron).
  pathForFile: (file) => webUtils.getPathForFile(file),
});
