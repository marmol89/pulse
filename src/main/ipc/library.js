import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile } from 'node:fs/promises';
import { AUDIO_EXTENSIONS } from '../../backend/library/tracks.js';
import { mediaTrack } from '../protocol/urls.js';

/**
 * Canales IPC de la biblioteca (en el bucket S3 o en carpetas del equipo) y de la conexión.
 * El renderer solo llega a ellos a través de window.api; la clave secreta nunca vuelve a la ventana.
 */
export function registerLibraryIpc({ store, source, librarySync, uploader, trash, lists, favorites, recents }) {
  ipcMain.handle('library:load', () => store.all().map(mediaTrack));

  // Los cambios llegan a la ventana por 'library:changed' (y los de las listas y favoritos, por 'lists:changed' y 'favorites:changed');
  // aquí solo se devuelve el resumen.
  ipcMain.handle('library:sync', async () => {
    const [{ added, removed }] = await Promise.all([librarySync.sync(), lists.sync(), favorites.sync(), recents.sync()]);
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

  // Papelera del bucket: eliminar, ver, restaurar y vaciar ({ ok, ... } o { ok: false, error }).
  ipcMain.handle('trash:move', (_event, id) => trash.move(id));
  ipcMain.handle('trash:list', () => trash.list());
  ipcMain.handle('trash:restore', (_event, key) => trash.restore(key));
  ipcMain.handle('trash:empty', () => trash.empty());

  ipcMain.handle('connection:get', () => source.summary());

  ipcMain.handle('connection:save', (_event, input) => source.connect(input ?? {}));

  ipcMain.handle('connection:import', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Elegir credentials.json',
      properties: ['openFile'],
      filters: [{ name: 'Credenciales', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return source.importCredentials(await readFile(filePaths[0], 'utf8'));
  });

  // Carpetas del equipo (en vez del bucket): solo se aceptan las elegidas en este diálogo o ya guardadas.
  ipcMain.handle('folders:choose', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Añadir una carpeta con música',
      properties: ['openDirectory'],
    });
    return canceled || !filePaths[0] ? null : source.offer({ id: filePaths[0], name: filePaths[0] });
  });

  ipcMain.handle('folders:save', (_event, ids) => source.useFolders(ids));
}
