import path from 'node:path';

/** Órdenes que llegan a la ventana ('desktop:command'): las convierte en play-toggle, next y previous. */
export const DESKTOP_COMMANDS = ['toggle', 'next', 'previous'];

/**
 * Integración con el escritorio: icono en la bandeja del sistema (con la canción y los controles), botones en la
 * miniatura de la barra de tareas de Windows y "Al cerrar, seguir en la bandeja" (cerrar oculta la ventana y la
 * música sigue; "Salir" del menú cierra de verdad). Las piezas de Electron llegan inyectadas para poder probarlo.
 * @param {{ Tray, Menu, nativeImage, app, platform: string, assets: string, getWindow: () => BrowserWindow | null,
 *   send: (command: string) => void }} deps
 */
export function createDesktop({ Tray, Menu, nativeImage, app, platform, assets, getWindow, send }) {
  const state = { title: '', artist: '', playing: false, hasTrack: false };
  let closeToTray = false;
  let quitting = false;
  let tray = null;
  const image = (name) => nativeImage.createFromPath(path.join(assets, 'controles', `${name}.png`));
  const buttons = platform === 'win32' ? { play: image('play'), pause: image('pause'), previous: image('previous'), next: image('next') } : null;

  function show() {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function menu() {
    const nowPlaying = state.hasTrack ? `${state.title} · ${state.artist}` : 'Nada sonando';
    return Menu.buildFromTemplate([
      { label: nowPlaying.length > 60 ? `${nowPlaying.slice(0, 59)}…` : nowPlaying, enabled: false },
      { type: 'separator' },
      { label: state.playing ? 'Pausar' : 'Reproducir', click: () => send('toggle') },
      { label: 'Anterior', enabled: state.hasTrack, click: () => send('previous') },
      { label: 'Siguiente', enabled: state.hasTrack, click: () => send('next') },
      { type: 'separator' },
      { label: 'Mostrar Pulse', click: show },
      {
        label: 'Salir',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]);
  }

  function refresh() {
    if (tray) {
      tray.setToolTip(state.hasTrack ? `Pulse · ${state.title} · ${state.artist}` : 'Pulse');
      tray.setContextMenu(menu());
    }
    const win = getWindow();
    if (!buttons || !win) return;
    win.setThumbarButtons([
      { tooltip: 'Anterior', icon: buttons.previous, flags: state.hasTrack ? [] : ['disabled'], click: () => send('previous') },
      { tooltip: state.playing ? 'Pausar' : 'Reproducir', icon: state.playing ? buttons.pause : buttons.play, click: () => send('toggle') },
      { tooltip: 'Siguiente', icon: buttons.next, flags: state.hasTrack ? [] : ['disabled'], click: () => send('next') },
    ]);
  }

  return {
    /** Crea el icono de la bandeja y engancha la ventana (cerrar → ocultar si se ha pedido). */
    attach(win) {
      if (!tray) {
        tray = new Tray(nativeImage.createFromPath(path.join(assets, 'icon.png')).resize({ width: 32, height: 32 }));
        tray.on('click', show);
      }
      win.on('close', (event) => {
        if (!closeToTray || quitting) return;
        event.preventDefault();
        win.hide();
      });
      app.on('before-quit', () => {
        quitting = true;
      });
      refresh();
    },

    /** Lo que suena: { title, artist, playing, hasTrack }. */
    update(next) {
      Object.assign(state, {
        title: String(next?.title ?? ''),
        artist: String(next?.artist ?? ''),
        playing: Boolean(next?.playing),
        hasTrack: Boolean(next?.hasTrack),
      });
      refresh();
    },

    setCloseToTray(enabled) {
      closeToTray = Boolean(enabled);
    },

    destroy() {
      tray?.destroy();
      tray = null;
    },
  };
}
