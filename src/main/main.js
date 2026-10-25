import { app, BrowserWindow, Menu, net, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMediaScheme, handleMediaProtocol } from './protocol/media.js';
import { createLibraryStore } from '../backend/library/store.js';
import { readRecordCover } from '../backend/library/tracks.js';
import { readRemoteCover } from '../backend/library/remote.js';
import { createLibrarySync } from '../backend/library/sync.js';
import { createUploader } from '../backend/library/upload.js';
import { collectPaths } from './library/collect.js';
import { createMetadataStore } from '../backend/library/metadata.js';
import { createListStore } from '../backend/library/lists.js';
import { createFavoriteStore } from '../backend/library/favorites.js';
import { objectResponse } from './protocol/responses.js';
import { mediaTrack } from './protocol/urls.js';
import { createConnectionStore } from '../backend/s3/connection.js';
import { createS3Service } from '../backend/s3/service.js';
import { createHttp } from '../backend/online/http.js';
import { createEnricher } from '../backend/online/enricher.js';
import { createEnrichmentQueue } from '../backend/online/queue.js';
import { registerLibraryIpc } from './ipc/library.js';
import { registerMetadataIpc } from './ipc/metadata.js';
import { registerListsIpc } from './ipc/lists.js';
import { registerFavoritesIpc } from './ipc/favorites.js';
import { createNodeFiles } from './files.js';

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
  // Archivos de la app en userData: library.json, s3.json y covers/.
  const files = createNodeFiles(app.getPath('userData'));
  // library.json es la caché local; la copia compartida va a metadatos/ del bucket tras cada guardado.
  let metadata = null;
  const store = createLibraryStore(files, { onSave: () => metadata?.schedulePush() });
  await store.load();

  // Datos de internet: net.fetch usa la red de Chromium (respeta el proxy del sistema).
  const http = createHttp((url, init) => net.fetch(url, init), {
    userAgent: `Pulse/${app.getVersion()} (reproductor de música de escritorio)`,
  });
  const enricher = createEnricher({ http, files });
  const queue = createEnrichmentQueue({ store, enricher, toTrack: mediaTrack, onUpdated: (tracks) => broadcast('library:tracks-updated', tracks) });

  // La música vive en un bucket S3. La clave secreta se cifra con el almacén seguro del sistema.
  const connections = createConnectionStore(files, {
    encrypt: async (text) => (await safeStorage.encryptStringAsync(text)).toString('base64'),
    decrypt: async (text) => {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(text, 'base64'));
      return { text: result, reencrypt: shouldReEncrypt };
    },
  });
  const s3 = createS3Service({ connections });
  await s3.load();
  metadata = createMetadataStore({ getStorage: () => s3.storage(), getRecords: () => store.all(), files });
  metadata.schedulePush(); // lo que ya hay en este equipo también llega al bucket
  // Listas de canciones: lists.json aquí y metadatos/listas.json en el bucket, compartidas con los demás equipos.
  const lists = createListStore({ files, getStorage: () => s3.storage(), onChange: (all) => broadcast('lists:changed', all) });
  await lists.load();
  // Favoritos: favorites.json aquí y metadatos/favoritos.json en el bucket, igual que las listas.
  const favorites = createFavoriteStore({ files, getStorage: () => s3.storage(), onChange: (all) => broadcast('favorites:changed', all) });
  await favorites.load();
  const librarySync = createLibrarySync({
    store,
    getStorage: () => s3.storage(),
    toTrack: mediaTrack,
    pullMetadata: () => metadata.pull(),
    onChange: (change) => {
      broadcast('library:changed', change);
      if (change.added.length > 0) queue.wake();
    },
    onUpdated: (tracks) => broadcast('library:tracks-updated', tracks),
  });

  const uploader = createUploader({
    getStorage: () => s3.storage(),
    collect: collectPaths, // archivos y carpetas del ordenador
    afterUpload: () => librarySync.sync(),
    onProgress: (progress) => broadcast('library:upload-progress', progress),
  });

  handleMediaProtocol({
    isAllowed: (id) => store.has(id),
    readCover: (id) =>
      readRecordCover(store.get(id), {
        readEmbedded: (record) => readRemoteCover(s3.storage(), record),
        readCover: (name) => metadata.readCover(name),
      }),
    openTrack: (id, range) => {
      const storage = s3.storage();
      const key = store.get(id)?.key;
      return storage && key ? objectResponse(storage, key, range) : new Response('Sin conexión con el almacenamiento', { status: 503 });
    },
  });
  registerLibraryIpc({ store, s3, librarySync, uploader, lists, favorites });
  registerMetadataIpc({ store, queue });
  registerListsIpc({ lists });
  registerFavoritesIpc({ favorites });
  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Cambios hechos en el bucket desde fuera (canciones, listas y favoritos): al arrancar y al volver a la ventana.
  const syncSoon = () => {
    librarySync.syncSoon();
    lists.syncSoon();
    favorites.syncSoon();
  };
  createWindow().webContents.once('did-finish-load', syncSoon);
  app.on('browser-window-focus', syncSoon);
  // No cerrar con metadatos, listas o favoritos sin subir al bucket.
  app.on('before-quit', (event) => {
    if (!metadata.hasPending() && !lists.hasPending() && !favorites.hasPending()) return;
    event.preventDefault();
    Promise.all([metadata.hasPending() && metadata.flush(), lists.hasPending() && lists.sync(), favorites.hasPending() && favorites.sync()]).finally(() => app.quit());
  });
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
