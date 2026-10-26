import { ipcMain } from 'electron';

/**
 * Bandeja, barra de tareas y mini-reproductor: la ventana cuenta lo que suena, si cerrar debe dejar Pulse en la
 * bandeja y cuándo pasar a mini-reproductor.
 */
export function registerDesktopIpc({ desktop }) {
  ipcMain.on('desktop:update', (_event, state) => desktop.update(state));
  ipcMain.on('desktop:close-to-tray', (_event, enabled) => desktop.setCloseToTray(enabled === true));
  ipcMain.on('desktop:mini', (_event, enabled) => desktop.setMini(enabled === true));
}
