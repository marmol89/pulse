import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton, favoriteButton, setFavoriteButton } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { createSeekBar, createTransport } from '../ui/transport.js';

const DEFAULT_DEVICE_LABEL = 'Este equipo';

/**
 * Pantalla 02 · Reproduciendo (overlay): portada grande, título, artista,
 * progreso, controles, salida de audio ("Altavoz de la sala"), cola y letra.
 * Emite: close-now-playing, toggle-favorite, seek, controles de transporte,
 * show-output-devices, output-device-change, open-collection (cola).
 */
export class NowPlayingView extends Colleague {
  #art;
  #context;
  #title;
  #artist;
  #favorite;
  #seek;
  #transport;
  #device;
  #deviceLabel;
  #deviceMenu;
  #lyrics;
  #lyricsText;
  #lyricsToggle;
  #currentPath = null;

  constructor(root) {
    super();
    const close = iconButton('chevron-down', 'Cerrar Reproduciendo', { 'data-autofocus': true });
    close.addEventListener('click', () => this.notify(EVENTS.CLOSE_NOW_PLAYING));
    this.#context = h('strong', { class: 'now-playing__context-title ellipsis' });
    this.#art = h('div', { class: 'now-playing__art' });
    this.#title = h('h2', { class: 'now-playing__title' });
    this.#artist = h('p', { class: 'now-playing__artist' });
    this.#favorite = favoriteButton(false);
    this.#favorite.addEventListener('click', () => this.notify(EVENTS.TOGGLE_FAVORITE, this.#currentPath ?? undefined));
    this.#seek = createSeekBar((seconds) => this.notify(EVENTS.SEEK, seconds), { size: 'lg' });
    this.#transport = createTransport((event) => this.notify(event), { size: 'lg' });
    const queue = iconButton('queue', 'Ver la cola');
    queue.addEventListener('click', () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'queue' }));

    root.replaceChildren(
      h(
        'div',
        { class: 'now-playing__inner' },
        h(
          'header',
          { class: 'now-playing__top' },
          close,
          h('div', { class: 'now-playing__context' }, h('span', { class: 'label' }, 'Reproduciendo desde'), this.#context),
          h('span', { 'aria-hidden': 'true' }),
        ),
        h(
          'div',
          { class: 'now-playing__body' },
          this.#art,
          h(
            'div',
            { class: 'now-playing__details' },
            h('div', { class: 'now-playing__info' }, h('div', { class: 'now-playing__text' }, this.#title, this.#artist), this.#favorite),
            this.#seek.element,
            this.#transport.element,
            h('div', { class: 'now-playing__actions' }, this.#createDevicePicker(), queue),
            this.#createLyrics(),
          ),
        ),
      ),
    );
  }

  show(track, isFavorite) {
    this.#currentPath = track.path;
    this.#art.replaceChildren(createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--hero' }));
    this.#title.textContent = track.title;
    this.#artist.textContent = track.artist;
    setFavoriteButton(this.#favorite, isFavorite);
    this.#lyrics.hidden = !track.lyrics;
    this.#lyricsText.textContent = track.lyrics ?? '';
    this.#setLyricsOpen(false);
  }

  /** Nombre de la colección que suena ("Reproduciendo desde …"). */
  setContext(title) {
    this.#context.textContent = title;
  }

  setProgress(current, duration) {
    this.#seek.setProgress(current, duration);
  }

  setPlaying(playing) {
    this.#transport.setPlaying(playing);
  }

  setModes(modes) {
    this.#transport.setModes(modes);
  }

  setFavorite(path, isFavorite) {
    if (path === this.#currentPath) setFavoriteButton(this.#favorite, isFavorite);
  }

  /** Abre el menú con las salidas de audio, marcando la actual. */
  showOutputDevices(devices, currentId) {
    const current = currentId || 'default';
    const options = devices.map((device) =>
      h(
        'li',
        { role: 'none' },
        h(
          'button',
          { type: 'button', class: 'device__option ellipsis', role: 'menuitemradio', 'aria-checked': String(device.id === current), 'data-device': device.id },
          device.label,
        ),
      ),
    );
    this.#deviceMenu.replaceChildren(...(options.length > 0 ? options : [h('li', { class: 'hint' }, 'No se encontraron salidas de audio')]));
    this.#deviceMenu.hidden = false;
    this.#device.setAttribute('aria-expanded', 'true');
    (this.#deviceMenu.querySelector('[aria-checked="true"]') ?? this.#deviceMenu.querySelector('button'))?.focus();
  }

  /** @param {{ id: string, label: string } | null} device */
  setOutputDevice(device) {
    this.#deviceLabel.textContent = device?.label ?? DEFAULT_DEVICE_LABEL;
    this.#device.classList.toggle('is-external', Boolean(device) && device.id !== 'default');
  }

  #createDevicePicker() {
    this.#deviceLabel = h('span', { class: 'ellipsis' }, DEFAULT_DEVICE_LABEL);
    this.#device = h(
      'button',
      { type: 'button', class: 'device__button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Elegir la salida de audio' },
      icon('device'),
      this.#deviceLabel,
    );
    this.#device.addEventListener('click', () => {
      if (this.#deviceMenu.hidden) this.notify(EVENTS.SHOW_OUTPUT_DEVICES);
      else this.#closeDeviceMenu();
    });
    this.#deviceMenu = h('ul', { class: 'device__menu', role: 'menu', 'aria-label': 'Salidas de audio', hidden: true });
    this.#deviceMenu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-device]');
      if (!option) return;
      this.#closeDeviceMenu();
      this.notify(EVENTS.OUTPUT_DEVICE_CHANGE, option.dataset.device);
    });
    this.#deviceMenu.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); // que Esc cierre solo el menú, no el overlay
      this.#closeDeviceMenu();
      this.#device.focus();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.#deviceMenu.hidden && !event.target.closest('.device')) this.#closeDeviceMenu();
    });
    return h('div', { class: 'device' }, this.#device, this.#deviceMenu);
  }

  #closeDeviceMenu() {
    this.#deviceMenu.hidden = true;
    this.#device.setAttribute('aria-expanded', 'false');
  }

  #createLyrics() {
    this.#lyricsText = h('p', { class: 'lyrics__text', id: 'lyrics-text', hidden: true });
    this.#lyricsToggle = h('button', { type: 'button', class: 'link-button', 'aria-expanded': 'false', 'aria-controls': 'lyrics-text' }, 'Mostrar');
    this.#lyricsToggle.addEventListener('click', () => this.#setLyricsOpen(this.#lyricsText.hidden));
    this.#lyrics = h(
      'section',
      { class: 'lyrics', hidden: true },
      h('header', { class: 'lyrics__header' }, h('h3', { class: 'lyrics__title' }, 'Letra'), this.#lyricsToggle),
      this.#lyricsText,
    );
    return this.#lyrics;
  }

  #setLyricsOpen(open) {
    this.#lyricsText.hidden = !open;
    this.#lyricsToggle.textContent = open ? 'Ocultar' : 'Mostrar';
    this.#lyricsToggle.setAttribute('aria-expanded', String(open));
  }
}
