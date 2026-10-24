import { app, BrowserWindow, Menu, net, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMediaScheme, handleMediaProtocol } from './protocol/media.js';
import { createLibraryStore } from './library/store.js';
import { readRecordCover } from './library/tracks.js';
import { readRemoteCover } from './library/remote.js';
import { createLibrarySync } from './library/sync.js';
import { objectResponse } from './protocol/responses.js';
import { createConnectionStore } from './s3/connection.js';
import { createS3Service } from './s3/service.js';
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

  // La música vive en un bucket S3. La clave secreta se cifra con el almacén seguro del sistema.
  const connections = createConnectionStore(path.join(userData, 's3.json'), {
    encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
    decrypt: (text) => safeStorage.decryptString(Buffer.from(text, 'base64')),
  });
  const s3 = createS3Service({ connections });
  await s3.load();
  const librarySync = createLibrarySync({
    store,
    getStorage: () => s3.storage(),
    onChange: (change) => {
      broadcast('library:changed', change);
      if (change.added.length > 0) queue.wake();
    },
  });

  handleMediaProtocol({
    isAllowed: (id) => store.has(id),
    readCover: (id) => readRecordCover(store.get(id), (record) => readRemoteCover(s3.storage(), record)),
    openTrack: (id, range) => {
      const storage = s3.storage();
      const key = store.get(id)?.key;
      return storage && key ? objectResponse(storage, key, range) : new Response('Sin conexión con el almacenamiento', { status: 503 });
    },
  });
  registerLibraryIpc({ store, s3, librarySync });
  registerMetadataIpc({ store, queue });
  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Cambios hechos en el bucket desde fuera: al arrancar y al volver a la ventana.
  createWindow().webContents.once('did-finish-load', () => librarySync.syncSoon());
  app.on('browser-window-focus', () => librarySync.syncSoon());
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
  // La app nunca navega ni abre ventanas.
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
