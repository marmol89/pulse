import { app, BrowserWindow, Menu, net } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMediaScheme, handleMediaProtocol } from './protocol/media.js';
import { createLibraryStore } from './library/store.js';
import { readRecordCover } from './library/tracks.js';
import { createAvailabilityMonitor } from './library/availability.js';
import { createHttp } from './online/http.js';
import { createEnricher } from './online/enricher.js';
import { createEnrichmentQueue } from './online/queue.js';
import { registerLibraryIpc } from './ipc/library.js';
import { registerMetadataIpc } from './ipc/metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUND = '#0E0E12'; // --color-bg del diseño: sin destello blanco al abrir

registerMediaScheme();
// La interfaz está en español: también los textos de Chromium (p. ej. "Predeterminado" en las salidas de audio).
app.commandLine.appendSwitch('lang', 'es');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  app.whenReady().then(start);
}

async function start() {
  const userData = app.getPath('userData');
  const store = createLibraryStore(path.join(userData, 'library.json'));
  await store.load();

  // Datos de internet: net.fetch usa la red de Chromium (respeta el proxy del sistema).
  const http = createHttp((url, init) => net.fetch(url, init), {
    userAgent: `Pulse/${app.getVersion()} (reproductor de música de escritorio)`,
  });
  const enricher = createEnricher({ http, coversDir: path.join(userData, 'covers') });
  const queue = createEnrichmentQueue({ store, enricher, onUpdated: (tracks) => broadcast('library:tracks-updated', tracks) });

  // Archivos borrados o movidos fuera de la app: se ocultan al arrancar y al volver a la ventana.
  const monitor = createAvailabilityMonitor({ store, onChange: (change) => broadcast('library:changed', change) });

  handleMediaProtocol({ isAllowed: (filePath) => store.has(filePath), readCover: (filePath) => readRecordCover(store.get(filePath)) });
  registerLibraryIpc(store, { onImported: () => queue.wake(), verifyTrack: (filePath) => monitor.verify(filePath) });
  registerMetadataIpc({ store, queue });
  if (app.isPackaged) Menu.setApplicationMenu(null);

  createWindow().webContents.once('did-finish-load', () => monitor.checkSoon());
  app.on('browser-window-focus', () => monitor.checkSoon());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Pulse',
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // La app nunca navega ni abre ventanas: soltar un archivo no debe sustituirla.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

function focusMainWindow() {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
