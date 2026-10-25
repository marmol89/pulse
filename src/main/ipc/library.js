import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { AUDIO_EXTENSIONS } from '../../backend/library/tracks.js';
import { mediaTrack } from '../protocol/urls.js';

/**
 * Canales IPC de la biblioteca (que vive en el bucket S3) y de la conexión.
 * El renderer solo llega a ellos a través de window.api; la clave secreta nunca vuelve a la ventana.
 */
export function registerLibraryIpc({ store, s3, librarySync, uploader, lists, favorites }) {
  ipcMain.handle('library:load', () => store.all().map(mediaTrack));

  // Los cambios llegan a la ventana por 'library:changed' (y los de las listas y favoritos, por 'lists:changed' y 'favorites:changed');
  // aquí solo se devuelve el resumen.
  ipcMain.handle('library:sync', async () => {
    const [{ added, removed }] = await Promise.all([librarySync.sync(), lists.sync(), favorites.sync()]);
    return { added: added.length, removed: removed.length };
  });

  ipcMain.handle('library:verify', (_event, id) => (typeof id === 'string' ? librarySync.verify(id) : false));

  // Subir canciones del ordenador al bucket (el progreso llega por 'library:upload-progress').
  ipcMain.handle('library:choose-uploads', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Subir canciones a tu bucket',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });
    return canceled || filePaths.length === 0 ? null : uploader.upload(filePaths);
  });

  // Archivos y carpetas arrastrados a la ventana (las rutas se validan en el uploader).
  ipcMain.handle('library:upload', (_event, paths) => uploader.upload(paths));

  ipcMain.handle('connection:get', () => s3.summary());

  ipcMain.handle('connection:save', (_event, input) => s3.connect(input ?? {}));

  ipcMain.handle('connection:import', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Elegir credentials.json',
      properties: ['openFile'],
      filters: [{ name: 'Credenciales', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return s3.importCredentials(await readFile(filePaths[0], 'utf8'));
  });
}
