import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { createAndroidApi } from './api.js';
import { createCapacitorFiles } from './files.js';
import { createKeystoreCrypto } from './secret.js';
import { handleBackButton } from './backButton.js';
import { NativeMediaMetadata, createNativeMediaSession } from './mediaSession.js';

/**
 * Punto de entrada de Android (scripts/build-android.mjs lo empaqueta en www/api.js, que se carga
 * antes que app.js): hace el papel del preload y del proceso main de Electron.
 */
const files = createCapacitorFiles(Filesystem, Directory.Data);
let coversFolder = '';
let dataFolder = '';

window.api = createAndroidApi({
  files,
  crypto: createKeystoreCrypto(SecureStorage),
  http: CapacitorHttp,
  // Las carátulas de covers/ se cargan como archivos locales del WebView.
  coverUrl: (name) => Capacitor.convertFileSrc(`${coversFolder}/${encodeURIComponent(name)}`),
  // Canciones descargadas (downloads/): Filesystem las baja directamente al disco y el <audio> las lee de ahí.
  fileUrl: (path) => Capacitor.convertFileSrc(`${dataFolder}/${path.split('/').map(encodeURIComponent).join('/')}`),
  async downloadFile(url, path) {
    // downloadFile no crea la carpeta aunque se le pida (recursive): se crea antes, solo si falta.
    const folder = path.split('/')[0];
    if (!(await files.list('')).includes(folder)) await Filesystem.mkdir({ path: folder, directory: Directory.Data, recursive: true });
    await Filesystem.downloadFile({ url, path, directory: Directory.Data });
  },
  async prepare() {
    await SecureStorage.setKeyPrefix('pulse.');
    coversFolder = (await files.uri('covers')).replace(/\/+$/, '');
    dataFolder = (await files.uri('')).replace(/\/+$/, '');
  },
  // Carpetas del móvil (FoldersPlugin.java): elegirlas con el selector del sistema y recorrerlas.
  folders: registerPlugin('PulseFolders'),
  document,
  userAgent: `Pulse/${__PULSE_VERSION__} (reproductor de música para Android)`,
  App,
});

App.addListener('backButton', () => handleBackButton(document, { minimize: () => App.minimizeApp() }));

// Controles del sistema y audio en segundo plano: el plugin nativo de android/app (PlaybackPlugin.java).
// El WebView no trae la Media Session API; MediaSessionBridge usa estas como las del navegador.
window.MediaMetadata ??= NativeMediaMetadata;
Object.defineProperty(navigator, 'mediaSession', {
  configurable: true,
  value: createNativeMediaSession({ plugin: registerPlugin('PulsePlayback'), fetch: globalThis.fetch.bind(globalThis) }),
});
