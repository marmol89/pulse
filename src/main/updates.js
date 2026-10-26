const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Actualizaciones automáticas (electron-updater, releases de GitHub): comprueba al arrancar y cada 6 h, descarga en
 * segundo plano y se instala al cerrar Pulse, o al momento con "Reiniciar ahora". Solo en la app instalada
 * (`app.isPackaged`): en desarrollo y en el e2e no hace nada. En Linux solo se actualiza el AppImage (el .deb lo
 * actualiza el gestor de paquetes). Los fallos (sin red, release a medio subir…) no se enseñan: se reintenta luego.
 *
 * @param {{ autoUpdater?: object | null, app: { isPackaged: boolean }, platform: string, env?: object,
 *   send: (status: object) => void, timers?: object, interval?: number }} deps `autoUpdater`: null si no aplica
 * @returns {{ available: boolean, start: () => void, status: () => object, install: () => void }}
 */
export function createUpdates({ autoUpdater, app, platform, env = process.env, send, timers = globalThis, interval = CHECK_EVERY_MS }) {
  const available = Boolean(autoUpdater) && app.isPackaged && (platform !== 'linux' || Boolean(env.APPIMAGE));
  let status = { state: available ? 'idle' : 'unavailable', version: null };

  const set = (next) => {
    status = { ...status, ...next };
    send(status);
  };

  const check = () =>
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch((error) => console.warn('[actualizaciones] no se pudo comprobar', error?.message ?? error));

  return {
    available,

    start() {
      if (!available) return;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info?.version ?? null }));
      autoUpdater.on('error', (error) => console.warn('[actualizaciones]', error?.message ?? error));
      check();
      timers.setInterval(check, interval);
    },

    /** { state: 'unavailable' | 'idle' | 'ready', version }: 'ready', descargada y lista para instalar. */
    status() {
      return status;
    },

    /** "Reiniciar ahora": cierra Pulse, instala la versión descargada y la vuelve a abrir. */
    install() {
      if (status.state === 'ready') autoUpdater.quitAndInstall(false, true);
    },
  };
}
