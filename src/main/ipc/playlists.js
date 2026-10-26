import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_PLAYLIST_BYTES, playlistFileName, playlistName } from '../../backend/paths.js';

const FILTERS = [{ name: 'Listas M3U', extensions: ['m3u8', 'm3u'] }];

/**
 * Exportar e importar listas M3U con los diálogos del sistema. El texto lo arma y lo lee la ventana (lib/m3u.js):
 * aquí solo se elige el archivo, se escribe y se lee. Devuelven { saved, error? } y { name, text } | { error } | null
 * (cancelado).
 */
export function registerPlaylistsIpc({ downloads }) {
  ipcMain.handle('playlists:export', async (event, name, text) => {
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Exportar lista',
      defaultPath: path.join(downloads(), playlistFileName(name)),
      filters: FILTERS,
    });
    if (canceled || !filePath) return { saved: false };
    try {
      await writeFile(filePath, String(text ?? ''), 'utf8');
      return { saved: true };
    } catch {
      return { saved: false, error: 'No se pudo guardar la lista en esa carpeta' };
    }
  });

  ipcMain.handle('playlists:import', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Importar lista',
      properties: ['openFile'],
      filters: FILTERS,
    });
    if (canceled || filePaths.length === 0) return null;
    const [file] = filePaths;
    try {
      if ((await stat(file)).size > MAX_PLAYLIST_BYTES) return { error: 'Ese archivo es demasiado grande para ser una lista' };
      return { name: playlistName(file), text: await readFile(file, 'utf8') };
    } catch {
      return { error: 'No se pudo leer ese archivo' };
    }
  });
}
