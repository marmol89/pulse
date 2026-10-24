import { ipcMain, dialog, BrowserWindow } from 'electron';
import { AUDIO_EXTENSIONS, toTrack } from '../library/tracks.js';
import { importPaths } from '../library/importer.js';
import { isMissing } from '../library/availability.js';

/**
 * Canales IPC de la biblioteca. El renderer solo llega a ellos a través de window.api (preload).
 * `onImported` avisa de que hay pistas nuevas (p. ej. para completarlas con datos de internet);
 * `verifyTrack` comprueba si el archivo de una pista sigue en el disco.
 */
export function registerLibraryIpc(store, { onImported = () => {}, verifyTrack = async () => true } = {}) {
  // Las pistas cuyo archivo falta no se muestran; vuelven solas si el archivo reaparece.
  ipcMain.handle('library:load', () => store.all().filter((record) => !isMissing(record)).map(toTrack));

  ipcMain.handle('library:verify', (_event, filePath) => (typeof filePath === 'string' ? verifyTrack(filePath) : false));

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

  ipcMain.handle('library:import', async (_event, paths) => {
    const tracks = await importPaths(store, paths);
    if (tracks.length > 0) onImported();
    return tracks;
  });
}
