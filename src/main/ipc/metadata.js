import { ipcMain } from 'electron';

/**
 * Datos de internet: activar la cola en segundo plano y buscar una pista al momento.
 * Los cambios de la cola llegan a la ventana por 'library:tracks-updated' (ver main.js).
 */
export function registerMetadataIpc({ store, queue }) {
  ipcMain.handle('metadata:set-enabled', (_event, enabled) => queue.setEnabled(enabled === true));

  ipcMain.handle('metadata:lookup', (_event, filePath, options = {}) => {
    if (typeof filePath !== 'string' || !store.has(filePath)) throw new TypeError('Pista desconocida');
    return queue.lookupNow(filePath, { force: options.force === true, lyrics: true });
  });
}
