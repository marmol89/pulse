import { ipcMain } from 'electron';

/**
 * Bandeja, barra de tareas y mini-reproductor: la ventana cuenta lo que suena, si cerrar debe dejar Pulse en la
 * bandeja y cuándo pasar a mini-reproductor. También las actualizaciones: su estado (los cambios llegan por
 * 'desktop:update-changed') y "Reiniciar ahora".
 */
export function registerDesktopIpc({ desktop, updates }) {
  ipcMain.on('desktop:update', (_event, state) => desktop.update(state));
  ipcMain.on('desktop:close-to-tray', (_event, enabled) => desktop.setCloseToTray(enabled === true));
  ipcMain.on('desktop:mini', (_event, enabled) => desktop.setMini(enabled === true));
  ipcMain.handle('desktop:update-status', () => updates.status());
  ipcMain.on('desktop:install-update', () => updates.install());
}
