import path from 'node:path';

/** Órdenes que llegan a la ventana ('desktop:command'): las convierte en play-toggle, next y previous. */
export const DESKTOP_COMMANDS = ['toggle', 'next', 'previous'];
/** Mini-reproductor: tamaño del contenido y el mínimo (el de la ventana normal es el de main.js). */
const MINI_SIZE = { width: 380, height: 92 };
const MINI_MIN = { width: 300, height: 92 };

/**
 * Integración con el escritorio: icono en la bandeja del sistema (con la canción y los controles), botones en la
 * miniatura de la barra de tareas de Windows, "Al cerrar, seguir en la bandeja" (cerrar oculta la ventana y la
 * música sigue; "Salir" del menú cierra de verdad) y el mini-reproductor (la misma ventana, pequeña y siempre
 * encima). Las piezas de Electron llegan inyectadas para poder probarlo.
 * @param {{ Tray, Menu, nativeImage, app, platform: string, assets: string, getWindow: () => BrowserWindow | null,
 *   send: (command: string) => void }} deps
 */
export function createDesktop({ Tray, Menu, nativeImage, app, platform, assets, getWindow, send }) {
  const state = { title: '', artist: '', playing: false, hasTrack: false };
  let closeToTray = false;
  let quitting = false;
  let tray = null;
  let normal = null; // { bounds, minimumSize, maximized } de antes del mini-reproductor
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

    /** Mini-reproductor: ventana pequeña y siempre encima; al volver, el tamaño y el sitio de antes. */
    setMini(enabled) {
      const win = getWindow();
      if (!win || Boolean(enabled) === (normal !== null)) return;
      if (enabled) {
        normal = { bounds: win.getBounds(), minimumSize: win.getMinimumSize(), maximized: win.isMaximized() };
        if (normal.maximized) win.unmaximize();
        win.setMinimumSize(MINI_MIN.width, MINI_MIN.height);
        win.setContentSize(MINI_SIZE.width, MINI_SIZE.height);
        win.setAlwaysOnTop(true, 'floating');
        return;
      }
      win.setAlwaysOnTop(false);
      win.setMinimumSize(...normal.minimumSize);
      win.setBounds(normal.bounds);
      if (normal.maximized) win.maximize();
      normal = null;
    },

    destroy() {
      tray?.destroy();
      tray = null;
    },
  };
}
