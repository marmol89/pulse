import { ipcMain } from 'electron';
import { recentResult } from '../../backend/library/recents.js';

/**
 * "Escuchado recientemente" (compartido en el bucket). Cada operación devuelve { ok, recents } o { ok: false, error };
 * los que llegan de otros equipos van a la ventana por 'recents:changed' (ver main.js).
 */
export function registerRecentsIpc({ recents }) {
  ipcMain.handle('recents:get', () => recents.all());
  ipcMain.handle('recents:add', (_event, path) => recentResult(() => recents.add(path)));
  ipcMain.handle('recents:import', (_event, paths) => recentResult(() => recents.import(Array.isArray(paths) ? paths : [])));
}
