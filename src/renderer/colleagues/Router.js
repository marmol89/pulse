import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { formatBytes, plural } from '../ui/format.js';

const NAV_ITEMS = [
  ['home', 'Inicio', 'home'],
  ['search', 'Buscar', 'search'],
  ['library', 'Biblioteca', 'library'],
];
const OVERLAY_DURATION_MS = 260;

/** Nombre corto de una carpeta: "Música" de "C:\Users\ana\Música" (en Android ya viene así). */
function folderName(folder) {
  return folder.name.split(/[\\/]/).filter(Boolean).at(-1) ?? folder.name;
}

/**
 * Esqueleto de la app: sidebar (la tab bar del diseño), qué vista se ve,
 * el overlay Reproduciendo, el estado de la conexión con el bucket y soltar canciones en la ventana.
 * En pantallas estrechas (Android) la sidebar es la tab bar de abajo y "Tu música" se abre como un
 * panel desde su pestaña (estado de UI: `is-menu-open`).
 * En la sidebar también están "Tus listas" (en pantallas estrechas se llega a ellas desde Inicio).
 * Emite: navigate, open-connection, upload-songs, files-dropped, sync-library, open-trash, set-online-lookup,
 * new-list, open-collection (una lista).
 */
export class Router extends Colleague {
  #root;
  #sidebar;
  #menuButton;
  #views;
  #overlay;
  #navButtons = new Map();
  #listsNav;
  #activeNav = 'home';
  #onlineSwitch;
  #downloadsRow;
  #downloadsHint;
  #crossfade;
  #loudness;
  #connectionStatus;
  #connectionIcon;
  /** Lo que solo tiene sentido con un bucket: subir canciones y la papelera. */
  #bucketOnly = [];
  #current = 'home';
  #previous = 'home';
  #returnFocus = null;
  #hideTimer = 0;
  #dragDepth = 0;

  constructor(root) {
    super();
    this.#root = root;
    this.#views = new Map([...root.querySelectorAll('[data-view]')].map((element) => [element.dataset.view, element]));
    this.#overlay = root.querySelector('[data-overlay]');
    this.#sidebar = root.querySelector('[data-sidebar]');
    this.#renderSidebar(this.#sidebar);
    this.#listenForDrops();
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.#setMenuOpen(false);
    });
    // Tocar el fondo oscuro de "Tu música" (el ::before de la sidebar) lo cierra.
    this.#sidebar.addEventListener('click', (event) => {
      if (event.target === this.#sidebar) this.#setMenuOpen(false);
    });
  }

  /** @param {'home'|'search'|'collection'} view @param {string|null} nav elemento de la sidebar a resaltar ('list:<id>' para una lista) */
  show(view, nav = view) {
    if (!this.#views.has(view)) return;
    this.#setMenuOpen(false);
    if (this.#current !== 'collection') this.#previous = this.#current;
    this.#current = view;
    for (const [name, element] of this.#views) element.hidden = name !== view;
    this.#setActiveNav(nav);
    this.#views.get(view).parentElement.scrollTop = 0;
  }

  /** Vista que se ve ahora. */
  current() {
    return this.#current;
  }

  /** Desde una colección, vuelve a la vista desde la que se abrió. */
  back() {
    this.show(this.#previous);
  }

  openOverlay() {
    if (this.isOverlayOpen()) return;
    clearTimeout(this.#hideTimer);
    this.#returnFocus = document.activeElement;
    this.#overlay.hidden = false;
    this.#setBackgroundInert(true);
    this.#overlay.getBoundingClientRect(); // fuerza el layout para que la transición arranque
    this.#overlay.classList.add('is-open');
    this.#overlay.querySelector('[data-autofocus]')?.focus();
  }

  closeOverlay() {
    if (!this.isOverlayOpen()) return;
    this.#overlay.classList.remove('is-open');
    this.#setBackgroundInert(false);
    this.#hideTimer = setTimeout(() => {
      this.#overlay.hidden = true;
    }, OVERLAY_DURATION_MS);
    this.#returnFocus?.focus?.();
  }

  isOverlayOpen() {
    return this.#overlay.classList.contains('is-open');
  }

  /** Descargas del móvil ({ count, bytes }); la fila solo aparece donde se puede descargar. */
  setDownloads({ count, bytes }) {
    this.#downloadsRow.hidden = false;
    this.#downloadsHint.textContent = count > 0 ? `${plural(count, 'canción', 'canciones')} · ${formatBytes(bytes)}` : 'Ninguna';
  }

  /** Segundos de fundido elegidos (0: sin fundido). */
  setCrossfade(seconds) {
    this.#crossfade.value = String(seconds);
  }

  /** Volumen uniforme elegido ('off', 'track' o 'album'). */
  setLoudness(mode) {
    this.#loudness.value = mode;
  }

  /** Refleja si se buscan carátulas e información en internet. */
  setOnlineLookup(enabled) {
    this.#onlineSwitch.checked = enabled;
  }

  /**
   * De dónde sale la música ({ mode, bucket, endpoint, folders } o null) bajo "Conexión". Con carpetas del
   * equipo no se ven "Subir canciones" ni "Papelera": Pulse no escribe en ellas.
   */
  setConnection(summary) {
    const local = summary?.mode === 'local';
    let status = 'Sin conectar';
    if (local) status = summary.folders.length === 1 ? folderName(summary.folders[0]) : plural(summary.folders.length, 'carpeta', 'carpetas');
    else if (summary?.mode === 's3') status = `${summary.bucket} · ${new URL(summary.endpoint).host}`;
    this.#connectionStatus.textContent = status;
    this.#connectionStatus.classList.toggle('is-off', !summary);
    this.#connectionIcon.replaceWith((this.#connectionIcon = icon(local ? 'folder' : 'cloud')));
    for (const element of this.#bucketOnly) element.hidden = local;
  }

  /** Listas del usuario bajo "Tus listas" ({ id, name }[]). */
  setLists(lists) {
    for (const key of [...this.#navButtons.keys()]) if (key.startsWith('list:')) this.#navButtons.delete(key);
    const items = lists.map((list) => {
      const button = h('button', { type: 'button', class: 'nav__item nav__item--list', title: list.name }, icon('playlist'), h('span', { class: 'ellipsis' }, list.name));
      button.addEventListener('click', () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'list', id: list.id }));
      this.#navButtons.set(`list:${list.id}`, button);
      return button;
    });
    this.#listsNav.replaceChildren(...items);
    this.#setActiveNav(this.#activeNav);
  }

  #renderSidebar(sidebar) {
    const nav = h('div', { class: 'nav' });
    for (const [view, label, iconName] of NAV_ITEMS) {
      const button = h('button', { type: 'button', class: 'nav__item' }, icon(iconName), label);
      button.addEventListener('click', () => this.notify(EVENTS.NAVIGATE, view));
      this.#navButtons.set(view, button);
      nav.append(button);
    }
    this.#connectionStatus = h('span', { class: 'nav__status ellipsis is-off' }, 'Sin conectar');
    this.#connectionIcon = icon('cloud');
    const connection = h(
      'button',
      { type: 'button', class: 'nav__item nav__item--status', title: 'Tu bucket S3 o carpetas de este equipo' },
      this.#connectionIcon,
      h('span', { class: 'nav__text' }, 'Conexión', this.#connectionStatus),
    );
    const upload = h('button', { type: 'button', class: 'nav__item' }, icon('upload'), 'Subir canciones');
    const refresh = h('button', { type: 'button', class: 'nav__item' }, icon('refresh'), 'Actualizar biblioteca');
    const trash = h('button', { type: 'button', class: 'nav__item', title: 'Canciones eliminadas del bucket: restaurarlas o borrarlas para siempre' }, icon('trash'), 'Papelera');
    const act = (event) => () => {
      this.#setMenuOpen(false);
      this.notify(event);
    };
    connection.addEventListener('click', act(EVENTS.OPEN_CONNECTION));
    upload.addEventListener('click', act(EVENTS.UPLOAD_SONGS));
    refresh.addEventListener('click', act(EVENTS.SYNC_LIBRARY));
    trash.addEventListener('click', act(EVENTS.OPEN_TRASH));
    // Solo se ve en pantallas estrechas: abre "Tu música" encima de la tab bar.
    this.#menuButton = h(
      'button',
      { type: 'button', class: 'nav__item nav__item--menu', 'aria-expanded': 'false', 'aria-controls': 'sidebar-menu' },
      icon('cloud'),
      'Tu música',
    );
    this.#menuButton.addEventListener('click', () => this.#setMenuOpen(!this.#sidebar.classList.contains('is-menu-open')));
    nav.append(this.#menuButton);
    this.#onlineSwitch = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: true });
    this.#onlineSwitch.addEventListener('change', () => this.notify(EVENTS.SET_ONLINE_LOOKUP, this.#onlineSwitch.checked));
    const onlineRow = h(
      'label',
      { class: 'switch-row', title: 'Envía el título y el artista de tus canciones a iTunes, Deezer y LRCLIB' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__title' }, 'Datos de internet'), h('span', { class: 'switch-row__hint' }, 'Carátulas, álbum, año y letra')),
      this.#onlineSwitch,
    );

    this.#downloadsHint = h('span', { class: 'switch-row__hint' });
    const clearDownloads = h('button', { type: 'button', class: 'link-button' }, 'Borrar');
    clearDownloads.addEventListener('click', () => this.notify(EVENTS.CLEAR_DOWNLOADS));
    this.#downloadsRow = h(
      'div',
      { class: 'switch-row downloads-row', hidden: true, title: 'Canciones guardadas en este móvil para escucharlas sin conexión' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__title' }, 'Descargas'), this.#downloadsHint),
      clearDownloads,
    );
    this.#crossfade = h(
      'select',
      { class: 'setting-row__select', id: 'crossfade-select' },
      ...[0, 2, 4, 6, 8].map((seconds) => h('option', { value: String(seconds) }, seconds === 0 ? 'No' : `${seconds} s`)),
    );
    this.#crossfade.addEventListener('change', () => this.notify(EVENTS.SET_CROSSFADE, Number(this.#crossfade.value)));
    const crossfadeRow = h(
      'label',
      { class: 'switch-row', for: 'crossfade-select', title: 'La canción que termina baja mientras empieza la siguiente' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__title' }, 'Fundido'), h('span', { class: 'switch-row__hint' }, 'Entre canciones')),
      this.#crossfade,
    );
    this.#loudness = h(
      'select',
      { class: 'setting-row__select', id: 'loudness-select' },
      ...Object.entries({ off: 'No', track: 'Canción', album: 'Disco' }).map(([mode, label]) => h('option', { value: mode }, label)),
    );
    this.#loudness.addEventListener('change', () => this.notify(EVENTS.SET_LOUDNESS, this.#loudness.value));
    const loudnessRow = h(
      'label',
      { class: 'switch-row', for: 'loudness-select', title: 'Iguala el volumen de las canciones que traen la etiqueta ReplayGain (por canción o por disco)' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__title' }, 'Volumen uniforme'), h('span', { class: 'switch-row__hint' }, 'Con ReplayGain')),
      this.#loudness,
    );
    const newList = h('button', { type: 'button', class: 'nav__item' }, icon('plus'), 'Nueva lista');
    newList.addEventListener('click', act(EVENTS.NEW_LIST));
    this.#listsNav = h('div', { class: 'sidebar__lists-items' });
    const hint = h('p', { class: 'sidebar__hint' }, 'También puedes arrastrar canciones o carpetas a la ventana para subirlas a tu bucket.');

    sidebar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand__logo' }, icon('pulse')), 'Pulse'),
      nav,
      h('div', { class: 'sidebar__section sidebar__lists' }, h('h2', { class: 'sidebar__heading' }, 'Tus listas'), newList, this.#listsNav),
      h('div', { class: 'sidebar__section', id: 'sidebar-menu' }, h('h2', { class: 'sidebar__heading' }, 'Tu música'), connection, upload, refresh, trash, onlineRow, crossfadeRow, loudnessRow, this.#downloadsRow),
      hint,
    );
    this.#bucketOnly = [upload, trash, hint];
    this.#setActiveNav('home');
  }

  #setMenuOpen(open) {
    this.#sidebar.classList.toggle('is-menu-open', open);
    this.#menuButton.setAttribute('aria-expanded', String(open));
  }

  #setActiveNav(nav) {
    this.#activeNav = nav;
    for (const [name, button] of this.#navButtons) {
      const active = name === nav;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  /** Archivos o carpetas soltados en cualquier parte de la ventana: se suben al bucket. */
  #listenForDrops() {
    const hasFiles = (event) => event.dataTransfer?.types?.includes('Files');
    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.#dragDepth += 1;
      this.#root.classList.add('is-dropping');
    });
    window.addEventListener('dragover', (event) => {
      if (hasFiles(event)) event.preventDefault();
    });
    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      this.#dragDepth = Math.max(0, this.#dragDepth - 1);
      if (this.#dragDepth === 0) this.#root.classList.remove('is-dropping');
    });
    window.addEventListener('drop', (event) => {
      event.preventDefault(); // sin esto, Chromium abriría el archivo en la ventana
      this.#dragDepth = 0;
      this.#root.classList.remove('is-dropping');
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) this.notify(EVENTS.FILES_DROPPED, files);
    });
  }

  /** Con el overlay abierto, lo de detrás no recibe foco ni clics (salvo los avisos y los diálogos, que se abren encima). */
  #setBackgroundInert(inert) {
    for (const element of this.#root.children) {
      if (element !== this.#overlay && !element.matches('[role="status"], dialog')) element.inert = inert;
    }
  }
}
