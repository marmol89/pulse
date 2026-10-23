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
 * el overlay Reproduciendo y la zona de arrastrar y soltar.
 * Emite: navigate, open-folder, open-files, files-dropped.
 */
export class Router extends Colleague {
  #root;
  #views;
  #overlay;
  #navButtons = new Map();
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

  #renderSidebar(sidebar) {
    const nav = h('div', { class: 'nav' });
    for (const [view, label, iconName] of NAV_ITEMS) {
      const button = h('button', { type: 'button', class: 'nav__item' }, icon(iconName), label);
      button.addEventListener('click', () => this.notify(EVENTS.NAVIGATE, view));
      this.#navButtons.set(view, button);
      nav.append(button);
    }
    const addFolder = h('button', { type: 'button', class: 'nav__item' }, icon('folder'), 'Añadir carpeta');
    const addFiles = h('button', { type: 'button', class: 'nav__item' }, icon('note'), 'Añadir archivos');
    addFolder.addEventListener('click', () => this.notify(EVENTS.OPEN_FOLDER));
    addFiles.addEventListener('click', () => this.notify(EVENTS.OPEN_FILES));

    sidebar.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'brand__logo' }, icon('pulse')), 'Pulse'),
      nav,
      h('div', { class: 'sidebar__section' }, h('h2', { class: 'sidebar__heading' }, 'Tu música'), addFolder, addFiles),
      h('p', { class: 'sidebar__hint' }, 'También puedes arrastrar canciones o carpetas a la ventana.'),
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

  /** Con el overlay abierto, lo de detrás no recibe foco ni clics. */
  #setBackgroundInert(inert) {
    for (const element of this.#root.children) {
      if (element !== this.#overlay && !element.matches('[role="status"]')) element.inert = inert;
    }
  }

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
      event.preventDefault();
      this.#dragDepth = 0;
      this.#root.classList.remove('is-dropping');
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) this.notify(EVENTS.FILES_DROPPED, files);
    });
  }
}
