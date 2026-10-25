import { ipcMain } from 'electron';
import { listResult } from '../../backend/library/lists.js';

/**
 * Listas de canciones (compartidas en el bucket). Cada operación devuelve { ok, lists, id? } o { ok: false, error };
 * las que llegan de otros equipos van a la ventana por 'lists:changed' (ver main.js).
 */
export function registerListsIpc({ lists }) {
  const text = (value) => (typeof value === 'string' ? value : '');
  const paths = (value) => (Array.isArray(value) ? value : []);

  ipcMain.handle('lists:get', () => lists.all());
  ipcMain.handle('lists:create', (_event, name, tracks) => listResult(() => lists.create(name, paths(tracks))));
  ipcMain.handle('lists:rename', (_event, id, name) => listResult(() => lists.rename(text(id), name)));
  ipcMain.handle('lists:add', (_event, id, tracks) => listResult(() => lists.add(text(id), paths(tracks))));
  ipcMain.handle('lists:move-track', (_event, id, path, to) => listResult(() => lists.moveTrack(text(id), text(path), Number(to))));
  ipcMain.handle('lists:remove-track', (_event, id, path) => listResult(() => lists.removeTrack(text(id), text(path))));
  ipcMain.handle('lists:delete', (_event, id) => listResult(() => lists.remove(text(id))));
}
