const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickFiles: () => ipcRenderer.invoke('library:pick-files'),
  pickFolder: () => ipcRenderer.invoke('library:pick-folder'),
});
