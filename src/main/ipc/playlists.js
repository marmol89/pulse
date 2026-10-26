import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024; // una lista M3U es texto: más que esto no es una lista
const FILTERS = [{ name: 'Listas M3U', extensions: ['m3u8', 'm3u'] }];

/** Nombre de archivo válido en Windows y Linux a partir del de la lista. */
export function fileNameFor(name) {
  const safe = String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return `${safe || 'Lista'}.m3u8`;
}

/**
 * Exportar e importar listas M3U con los diálogos del sistema. El texto lo arma y lo lee la ventana (lib/m3u.js):
 * aquí solo se elige el archivo, se escribe y se lee. Devuelven { saved, error? } y { name, text } | { error } | null
 * (cancelado).
 */
export function registerPlaylistsIpc({ downloads }) {
  ipcMain.handle('playlists:export', async (event, name, text) => {
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Exportar lista',
      defaultPath: path.join(downloads(), fileNameFor(name)),
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
      if ((await stat(file)).size > MAX_BYTES) return { error: 'Ese archivo es demasiado grande para ser una lista' };
      return { name: path.basename(file, path.extname(file)), text: await readFile(file, 'utf8') };
    } catch {
      return { error: 'No se pudo leer ese archivo' };
    }
  });
}
