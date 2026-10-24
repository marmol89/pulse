import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton, favoriteButton, setFavoriteButton } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { createSeekBar, createTransport } from '../ui/transport.js';
import { formatDeviceLabel, trackDetails } from '../ui/format.js';

const DEFAULT_DEVICE_LABEL = 'Este equipo';

/**
 * Pantalla 02 · Reproduciendo (overlay): portada grande, título, artista,
 * progreso, controles, salida de audio ("Altavoz de la sala"), cola, información y letra.
 * Emite: close-now-playing, toggle-favorite, seek, controles de transporte,
 * show-output-devices, output-device-change, open-collection (cola), lookup-track.
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
  #infoList;
  #lookupButton;
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
            this.#createInfo(),
            this.#createLyrics(),
          ),
        ),
      ),
    );
  }

  /** También se llama con la misma pista cuando llegan sus datos de internet: no pliega la letra. */
  show(track, isFavorite) {
    const samePath = track.path === this.#currentPath;
    this.#currentPath = track.path;
    this.#art.replaceChildren(createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--hero' }));
    this.#title.textContent = track.title;
    this.#artist.textContent = track.artist;
    setFavoriteButton(this.#favorite, isFavorite);
    this.#infoList.replaceChildren(
      ...trackDetails(track).map(([label, value]) => h('div', { class: 'info-card__row' }, h('dt', {}, label), h('dd', {}, value))),
    );
    this.#lyrics.hidden = !track.lyrics;
    this.#lyricsText.textContent = track.lyrics ?? '';
    if (!samePath) this.#setLyricsOpen(false);
  }

  /** "Buscar en internet": 'loading' mientras busca, 'idle' al terminar. */
  setLookupState(state) {
    const loading = state === 'loading';
    this.#lookupButton.disabled = loading;
    this.#lookupButton.textContent = loading ? 'Buscando…' : 'Buscar en internet';
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
    const options = devices.map((device, index) =>
      h(
        'li',
        { role: 'none' },
        h(
          'button',
          { type: 'button', class: 'device__option ellipsis', role: 'menuitemradio', 'aria-checked': String(device.id === current), 'data-device': device.id },
          formatDeviceLabel(device, index),
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
    this.#deviceLabel.textContent = device ? formatDeviceLabel(device) : DEFAULT_DEVICE_LABEL;
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
    // Donde no se puede elegir la salida (el WebView de Android), el selector no se muestra.
    const canChoose = typeof globalThis.HTMLMediaElement?.prototype.setSinkId === 'function';
    return h('div', { class: 'device', hidden: !canChoose }, this.#device, this.#deviceMenu);
  }

  #closeDeviceMenu() {
    this.#deviceMenu.hidden = true;
    this.#device.setAttribute('aria-expanded', 'false');
  }

  #createInfo() {
    this.#infoList = h('dl', { class: 'info-card__list' });
    this.#lookupButton = h(
      'button',
      { type: 'button', class: 'link-button', title: 'Buscar carátula, álbum, año, género y letra en internet' },
      'Buscar en internet',
    );
    this.#lookupButton.addEventListener('click', () => {
      if (this.#currentPath) this.notify(EVENTS.LOOKUP_TRACK, this.#currentPath);
    });
    return h(
      'section',
      { class: 'info-card', 'aria-label': 'Información de la canción' },
      h('header', { class: 'info-card__header' }, h('h3', { class: 'info-card__title' }, 'Información'), this.#lookupButton),
      this.#infoList,
    );
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
