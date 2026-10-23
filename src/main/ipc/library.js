import { ipcMain, dialog, BrowserWindow } from 'electron';
import { AUDIO_EXTENSIONS, toTrack } from '../library/tracks.js';
import { importPaths } from '../library/importer.js';

/** Canales IPC de la biblioteca. El renderer solo llega a ellos a través de window.api (preload). */
export function registerLibraryIpc(store) {
  ipcMain.handle('library:load', () => store.all().map(toTrack));

  ipcMain.handle('library:choose-files', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Añadir archivos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });
    return canceled ? [] : filePaths;
  });

  ipcMain.handle('library:choose-folder', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Añadir carpeta',
      properties: ['openDirectory'],
    });
    return canceled ? null : (filePaths[0] ?? null);
  });

  ipcMain.handle('library:import', (_event, paths) => importPaths(store, paths));
}
