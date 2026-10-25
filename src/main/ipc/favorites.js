import { ipcMain } from 'electron';
import { favoriteResult } from '../../backend/library/favorites.js';

/**
 * Favoritos (compartidos en el bucket). Cada operación devuelve { ok, favorites } o { ok: false, error };
 * los que llegan de otros equipos van a la ventana por 'favorites:changed' (ver main.js).
 */
export function registerFavoritesIpc({ favorites }) {
  ipcMain.handle('favorites:get', () => favorites.all());
  ipcMain.handle('favorites:set', (_event, path, favorite) => favoriteResult(() => favorites.set(path, favorite === true)));
  ipcMain.handle('favorites:import', (_event, paths) => favoriteResult(() => favorites.import(Array.isArray(paths) ? paths : [])));
}
