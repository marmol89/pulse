import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const NAV_ITEMS = [
  ['home', 'Inicio', 'home'],
  ['search', 'Buscar', 'search'],
  ['library', 'Biblioteca', 'library'],
];
const OVERLAY_DURATION_MS = 260;

/**
 * Esqueleto de la app: sidebar (la tab bar del diseño), qué vista se ve,
 * el overlay Reproduciendo, el estado de la conexión con el bucket y soltar canciones en la ventana.
 * Emite: navigate, open-connection, upload-songs, files-dropped, sync-library, set-online-lookup.
 */
export class Router extends Colleague {
  #root;
  #views;
  #overlay;
  #navButtons = new Map();
  #onlineSwitch;
  #connectionStatus;
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
    this.#renderSidebar(root.querySelector('[data-sidebar]'));
    this.#listenForDrops();
  }

  /** @param {'home'|'search'|'collection'} view @param {string|null} nav elemento de la sidebar a resaltar */
  show(view, nav = view) {
    if (!this.#views.has(view)) return;
    if (this.#current !== 'collection') this.#previous = this.#current;
    this.#current = view;
    for (const [name, element] of this.#views) element.hidden = name !== view;
    this.#setActiveNav(nav);
    this.#views.get(view).parentElement.scrollTop = 0;
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

  /** Refleja si se buscan carátulas e información en internet. */
  setOnlineLookup(enabled) {
    this.#onlineSwitch.checked = enabled;
  }

  /** Bucket conectado ({ bucket, endpoint } o null) bajo "Conexión S3". */
  setConnection(summary) {
    this.#connectionStatus.textContent = summary ? `${summary.bucket} · ${new URL(summary.endpoint).host}` : 'Sin conectar';
    this.#connectionStatus.classList.toggle('is-off', !summary);
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
    const connection = h(
      'button',
      { type: 'button', class: 'nav__item nav__item--status' },
      icon('cloud'),
      h('span', { class: 'nav__text' }, 'Conexión S3', this.#connectionStatus),
    );
    const upload = h('button', { type: 'button', class: 'nav__item' }, icon('upload'), 'Subir canciones');
    const refresh = h('button', { type: 'button', class: 'nav__item' }, icon('refresh'), 'Actualizar biblioteca');
    connection.addEventListener('click', () => this.notify(EVENTS.OPEN_CONNECTION));
    upload.addEventListener('click', () => this.notify(EVENTS.UPLOAD_SONGS));
    refresh.addEventListener('click', () => this.notify(EVENTS.SYNC_LIBRARY));
    this.#onlineSwitch = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: true });
    this.#onlineSwitch.addEventListener('change', () => this.notify(EVENTS.SET_ONLINE_LOOKUP, this.#onlineSwitch.checked));
    const onlineRow = h(
      'label',
      { class: 'switch-row', title: 'Envía el título y el artista de tus canciones a iTunes, Deezer y LRCLIB' },
      h('span', { class: 'switch-row__text' }, h('span', { class: 'switch-row__title' }, 'Datos de internet'), h('span', { class: 'switch-row__hint' }, 'Carátulas, álbum, año y letra')),
      this.#onlineSwitch,
    );

    sidebar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand__logo' }, icon('pulse')), 'Pulse'),
      nav,
      h('div', { class: 'sidebar__section' }, h('h2', { class: 'sidebar__heading' }, 'Tu música'), connection, upload, refresh, onlineRow),
      h('p', { class: 'sidebar__hint' }, 'También puedes arrastrar canciones o carpetas a la ventana para subirlas a tu bucket.'),
    );
    this.#setActiveNav('home');
  }

  #setActiveNav(nav) {
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

  /** Con el overlay abierto, lo de detrás no recibe foco ni clics. */
  #setBackgroundInert(inert) {
    for (const element of this.#root.children) {
      if (element !== this.#overlay && !element.matches('[role="status"]')) element.inert = inert;
    }
  }
}
