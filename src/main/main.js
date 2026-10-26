import { app, BrowserWindow, Menu, Tray, nativeImage, net, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMediaScheme, handleMediaProtocol } from './protocol/media.js';
import { createLibraryStore } from '../backend/library/store.js';
import { readRecordCover } from '../backend/library/tracks.js';
import { createEmbeddedCovers } from '../backend/library/covers.js';
import { createLibrarySync } from '../backend/library/sync.js';
import { createUploader } from '../backend/library/upload.js';
import { createTrash } from '../backend/library/trash.js';
import { collectPaths } from './library/collect.js';
import { createMetadataStore } from '../backend/library/metadata.js';
import { loadUserData } from '../backend/library/userData.js';
import { objectResponse } from './protocol/responses.js';
import { mediaTrack } from './protocol/urls.js';
import { createConnectionStore } from '../backend/s3/connection.js';
import { createS3Service } from '../backend/s3/service.js';
import { createSourceService } from '../backend/source.js';
import { createFolderStorage } from './library/folderStorage.js';
import { createHttp } from '../backend/online/http.js';
import { createEnricher } from '../backend/online/enricher.js';
import { createEnrichmentQueue } from '../backend/online/queue.js';
import { createArtistPictures } from '../backend/online/artists.js';
import { registerLibraryIpc } from './ipc/library.js';
import { artistPictureUrls, registerMetadataIpc } from './ipc/metadata.js';
import { registerListsIpc } from './ipc/lists.js';
import { registerFavoritesIpc } from './ipc/favorites.js';
import { registerRecentsIpc } from './ipc/recents.js';
import { registerPlaysIpc } from './ipc/plays.js';
import { registerDesktopIpc } from './ipc/desktop.js';
import { registerPlaylistsIpc } from './ipc/playlists.js';
import { createDesktop } from './desktop.js';
import { createUpdates } from './updates.js';
import { createNodeFiles } from './files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUND = '#0E0E12'; // --color-bg del diseño: sin destello blanco al abrir
const QUIT_WAIT_MS = 15_000; // lo más que se espera al cerrar a subir lo pendiente al bucket

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
  // Archivos de la app en userData: library.json, s3.json, local.json (carpetas) y covers/.
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
  // Fotos de artista de Deezer (artists.json y covers/).
  const artistPictures = createArtistPictures({ files, http, getRecords: () => store.all(), onUpdated: (pictures) => broadcast('artists:pictures-changed', artistPictureUrls(pictures)) });
  await artistPictures.load();

  // La música vive en un bucket S3 (la clave secreta se cifra con el almacén seguro del sistema) o en carpetas del equipo.
  const connections = createConnectionStore(files, {
    encrypt: async (text) => (await safeStorage.encryptStringAsync(text)).toString('base64'),
    decrypt: async (text) => {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(text, 'base64'));
      return { text: result, reencrypt: shouldReEncrypt };
    },
  });
  const source = createSourceService({ s3: createS3Service({ connections }), files, createFolderStorage });
  await source.load();
  metadata = createMetadataStore({ getStorage: () => source.storage(), getRecords: () => store.all(), files });
  metadata.schedulePush(); // lo que ya hay en este equipo también llega al bucket
  // Listas, favoritos, recientes y escuchas: aquí y en metadatos/ del bucket, compartidos con los demás equipos.
  const userData = await loadUserData({ files, getStorage: () => source.storage(), onChange: (kind, all) => broadcast(`${kind}:changed`, all) });
  // Carátulas incrustadas en covers/ de userData: se descargan del bucket una sola vez.
  const embeddedCovers = createEmbeddedCovers({ files, getStorage: () => source.storage() });
  const librarySync = createLibrarySync({
    store,
    getStorage: () => source.storage(),
    toTrack: mediaTrack,
    pullMetadata: () => metadata.pull(),
    onChange: (change) => {
      broadcast('library:changed', change);
      if (change.added.length > 0) queue.wake();
    },
    onUpdated: (tracks) => broadcast('library:tracks-updated', tracks),
    onPicture: (record, picture) => embeddedCovers.save(record, picture),
  });

  const uploader = createUploader({
    getStorage: () => source.storage(),
    collect: collectPaths, // archivos y carpetas del ordenador
    afterUpload: () => librarySync.sync(),
    onProgress: (progress) => broadcast('library:upload-progress', progress),
  });
  // "Eliminar del bucket": a papelera/, de donde se puede restaurar.
  const trash = createTrash({ getStorage: () => source.storage(), store, afterRestore: () => librarySync.sync() });

  handleMediaProtocol({
    isAllowed: (id) => store.has(id),
    readCover: (id) =>
      readRecordCover(store.get(id), {
        readEmbedded: (record) => embeddedCovers.get(record),
        readCover: (name) => metadata.readCover(name),
      }),
    readArtist: (name) => artistPictures.read(name),
    openTrack: (id, range) => {
      const storage = source.storage();
      const key = store.get(id)?.key;
      return storage && key ? objectResponse(storage, key, range) : new Response('Sin conexión con el almacenamiento', { status: 503 });
    },
  });
  registerLibraryIpc({ store, source, librarySync, uploader, trash, userData });
  registerMetadataIpc({ store, queue, artistPictures, toTrack: mediaTrack });
  registerListsIpc(userData);
  registerFavoritesIpc(userData);
  registerRecentsIpc(userData);
  registerPlaysIpc(userData);
  registerPlaylistsIpc({ downloads: () => app.getPath('downloads') });
  // Bandeja del sistema y botones de la barra de tareas (las órdenes van a la ventana por 'desktop:command').
  const desktop = createDesktop({
    Tray,
    Menu,
    nativeImage,
    app,
    platform: process.platform,
    assets: path.join(__dirname, '../assets'),
    getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
    send: (command) => broadcast('desktop:command', command),
  });
  // Actualizaciones automáticas: electron-updater solo se carga en la app instalada.
  const updates = createUpdates({
    autoUpdater: app.isPackaged ? (await import('electron-updater')).default.autoUpdater : null,
    app,
    platform: process.platform,
    send: (status) => broadcast('desktop:update-changed', status),
  });
  registerDesktopIpc({ desktop, updates });
  if (app.isPackaged) Menu.setApplicationMenu(null);

  // Cambios hechos en el bucket desde fuera (canciones, listas y favoritos): al arrancar y al volver a la ventana.
  const syncSoon = () => {
    librarySync.syncSoon();
    userData.syncSoon();
  };
  const win = createWindow();
  desktop.attach(win);
  win.webContents.once('did-finish-load', syncSoon);
  app.on('browser-window-focus', syncSoon);
  updates.start();
  // No cerrar con metadatos, listas, favoritos, recientes o escuchas sin subir al bucket.
  // Se espera una sola vez y como mucho QUIT_WAIT_MS: si falla (sin red), lo pendiente se reintenta en la próxima
  // sesión y no se vuelve a esperar (seguiría pendiente y la app no llegaría a cerrarse nunca).
  let flushedBeforeQuit = false;
  app.on('before-quit', (event) => {
    if (flushedBeforeQuit || (!metadata.hasPending() && !userData.hasPending())) return;
    flushedBeforeQuit = true;
    event.preventDefault();
    const uploads = Promise.all([metadata.hasPending() && metadata.flush(), userData.flush()]);
    const deadline = new Promise((resolve) => setTimeout(resolve, QUIT_WAIT_MS));
    Promise.race([uploads, deadline])
      .catch(() => {})
      .then(() => app.quit());
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) desktop.attach(createWindow());
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
  win.show(); // puede estar oculta en la bandeja
  win.focus();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
