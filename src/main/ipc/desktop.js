import { ipcMain } from 'electron';

/** Bandeja y barra de tareas: la ventana cuenta lo que suena y si cerrar debe dejar Pulse en la bandeja. */
export function registerDesktopIpc({ desktop }) {
  ipcMain.on('desktop:update', (_event, state) => desktop.update(state));
  ipcMain.on('desktop:close-to-tray', (_event, enabled) => desktop.setCloseToTray(enabled === true));
}
