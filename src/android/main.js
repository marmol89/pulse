import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { createAndroidApi } from './api.js';
import { createCapacitorFiles } from './files.js';
import { createKeystoreCrypto } from './secret.js';
import { handleBackButton } from './backButton.js';

/**
 * Punto de entrada de Android (scripts/build-android.mjs lo empaqueta en www/api.js, que se carga
 * antes que app.js): hace el papel del preload y del proceso main de Electron.
 */
const files = createCapacitorFiles(Filesystem, Directory.Data);
let coversFolder = '';

window.api = createAndroidApi({
  files,
  crypto: createKeystoreCrypto(SecureStorage),
  http: CapacitorHttp,
  // Las carátulas de covers/ se cargan como archivos locales del WebView.
  coverUrl: (name) => Capacitor.convertFileSrc(`${coversFolder}/${encodeURIComponent(name)}`),
  async prepare() {
    await SecureStorage.setKeyPrefix('pulse.');
    coversFolder = (await files.uri('covers')).replace(/\/+$/, '');
  },
  document,
  userAgent: `Pulse/${__PULSE_VERSION__} (reproductor de música para Android)`,
  App,
});

App.addListener('backButton', () => handleBackButton(document, { minimize: () => App.minimizeApp() }));
