import { ipcMain } from 'electron';
import { playResult } from '../../backend/library/plays.js';

/**
 * Escuchas de cada canción (compartidas en el bucket). Devuelven { ruta: escuchas } o { ok, plays } / { ok: false, error };
 * las que llegan de otros equipos van a la ventana por 'plays:changed' (ver main.js).
 */
export function registerPlaysIpc({ plays }) {
  ipcMain.handle('plays:get', () => plays.all());
  ipcMain.handle('plays:add', (_event, path) => playResult(() => plays.add(path)));
}
