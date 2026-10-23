import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerLibraryIpc } from './ipc/library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// media://<ruta-codificada> sirve archivos de audio locales al renderer sin usar file://
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true, secure: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0E0E12', // --color-bg del diseño
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(request.url.slice('media://'.length));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerLibraryIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
