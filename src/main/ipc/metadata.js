import { ipcMain } from 'electron';

import { artistPictureUrl } from '../protocol/urls.js';
import { editRecord } from '../../backend/library/edits.js';

/**
 * Datos de internet: activar la cola en segundo plano, buscar una pista al momento y las fotos de artista.
 * Los cambios de la cola llegan a la ventana por 'library:tracks-updated' y las fotos nuevas por
 * 'artists:pictures-changed' (ver main.js). También "Editar datos" de una canción ({ ok, track } | { ok: false, error }).
 */
export function registerMetadataIpc({ store, queue, artistPictures, toTrack }) {
  ipcMain.handle('metadata:set-enabled', (_event, enabled) => {
    artistPictures.setEnabled(enabled === true);
    return queue.setEnabled(enabled === true);
  });

  ipcMain.handle('artists:pictures', (_event, names) => artistPictureUrls(artistPictures.request(Array.isArray(names) ? names : [])));

  ipcMain.handle('metadata:lookup', (_event, filePath, options = {}) => {
    if (typeof filePath !== 'string' || !store.has(filePath)) throw new TypeError('Pista desconocida');
    return queue.lookupNow(filePath, { force: options.force === true, lyrics: true });
  });

  ipcMain.handle('metadata:edit', async (_event, id, changes) => {
    const result = await editRecord(store, String(id), changes && typeof changes === 'object' ? changes : null);
    return result.ok ? { ok: true, track: toTrack(result.record) } : result;
  });
}

/** { nombre: coverName } → { nombre: URL media:// } */
export function artistPictureUrls(pictures) {
  return Object.fromEntries(Object.entries(pictures).map(([name, coverName]) => [name, artistPictureUrl(coverName)]));
}
