import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton, favoriteButton, setFavoriteButton } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { createSeekBar, createTransport } from '../ui/transport.js';
import { formatClock, formatDeviceLabel, trackDetails } from '../ui/format.js';
import { parseLrc, activeLine } from '../lib/lrc.js';

const DEFAULT_DEVICE_LABEL = 'Este equipo';
/** Opciones del temporizador de apagado: minutos, 'track' (al acabar la canción) o null (desactivado). */
const SLEEP_OPTIONS = [
  [null, 'Desactivado'],
  [15, '15 minutos'],
  [30, '30 minutos'],
  [45, '45 minutos'],
  [60, '1 hora'],
  ['track', 'Al acabar esta canción'],
];

/**
 * Pantalla 02 · Reproduciendo (overlay): portada grande, título, artista,
 * progreso, controles, salida de audio ("Altavoz de la sala"), cola, información y letra
 * (sincronizada si la hay: el verso que suena se resalta y pulsar uno salta a él).
 * Emite: close-now-playing, toggle-favorite, seek, controles de transporte,
 * show-output-devices, output-device-change, open-collection (cola), lookup-track, choose-list, set-sleep-timer.
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
  #lyricLines = [];
  #activeLine = -1;
  #infoList;
  #lookupButton;
  #sleepButton;
  #sleepLabel;
  #sleepMenu;
  #sleepState = { mode: 'off', endsAt: 0 };
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
    const addToList = iconButton('plus', 'Añadir a una lista', { className: 'now-playing__add' });
    addToList.addEventListener('click', () => this.notify(EVENTS.CHOOSE_LIST, this.#currentPath ?? undefined));
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
            h('div', { class: 'now-playing__info' }, h('div', { class: 'now-playing__text' }, this.#title, this.#artist), addToList, this.#favorite),
            this.#seek.element,
            this.#transport.element,
            h('div', { class: 'now-playing__actions' }, this.#createDevicePicker(), h('div', { class: 'now-playing__end-actions' }, this.#createSleepPicker(), queue)),
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
    this.#renderLyrics(track);
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
    this.#syncLyrics(current);
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

  /** Temporizador de apagado activo ({ mode, endsAt } de SleepTimer): el botón dice hasta cuándo. */
  setSleepTimer(state) {
    this.#sleepState = state;
    const active = state.mode !== 'off';
    this.#sleepLabel.textContent = state.mode === 'track' ? 'Fin de la canción' : active ? `Hasta las ${formatClock(state.endsAt)}` : '';
    this.#sleepLabel.hidden = !active;
    this.#sleepButton.classList.toggle('is-external', active);
    this.#sleepButton.setAttribute('aria-label', active ? `Temporizador: ${this.#sleepLabel.textContent}` : 'Temporizador de apagado');
  }

  #createSleepPicker() {
    this.#sleepLabel = h('span', { class: 'ellipsis', hidden: true });
    this.#sleepButton = h(
      'button',
      { type: 'button', class: 'device__button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Temporizador de apagado', title: 'Temporizador de apagado' },
      icon('timer'),
      this.#sleepLabel,
    );
    this.#sleepMenu = h('ul', { class: 'device__menu device__menu--end', role: 'menu', 'aria-label': 'Temporizador de apagado', hidden: true });
    this.#sleepButton.addEventListener('click', () => (this.#sleepMenu.hidden ? this.#openSleepMenu() : this.#closeSleepMenu()));
    this.#sleepMenu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-sleep]');
      if (!option) return;
      this.#closeSleepMenu();
      this.#sleepButton.focus(); // el foco no se queda en el menú oculto
      const [choice] = SLEEP_OPTIONS[Number(option.dataset.sleep)];
      this.notify(EVENTS.SET_SLEEP_TIMER, choice);
    });
    this.#sleepMenu.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); // que Esc cierre solo el menú, no el overlay
      this.#closeSleepMenu();
      this.#sleepButton.focus();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!this.#sleepMenu.hidden && !event.target.closest('.sleep-timer')) this.#closeSleepMenu();
    });
    return h('div', { class: 'device sleep-timer' }, this.#sleepButton, this.#sleepMenu);
  }

  #openSleepMenu() {
    const current = this.#sleepState.mode === 'track' ? 'track' : this.#sleepState.mode === 'off' ? null : undefined;
    this.#sleepMenu.replaceChildren(
      ...SLEEP_OPTIONS.map(([choice, label], index) =>
        h(
          'li',
          { role: 'none' },
          h('button', { type: 'button', class: 'device__option', role: 'menuitemradio', 'aria-checked': String(choice === current), 'data-sleep': String(index) }, label),
        ),
      ),
    );
    this.#sleepMenu.hidden = false;
    this.#sleepButton.setAttribute('aria-expanded', 'true');
    this.#sleepMenu.querySelector('button')?.focus();
  }

  #closeSleepMenu() {
    this.#sleepMenu.hidden = true;
    this.#sleepButton.setAttribute('aria-expanded', 'false');
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
    if (open) this.#scrollToActive('instant');
  }

  /** Letra sincronizada: un botón por verso (pulsarlo salta a él); si no, el texto plano. */
  #renderLyrics(track) {
    const lines = parseLrc(track.syncedLyrics);
    this.#lyrics.hidden = !track.lyrics && lines.length === 0;
    this.#lyricsText.classList.toggle('lyrics__text--synced', lines.length > 0);
    this.#activeLine = -1;
    this.#lyricLines = lines.map(({ time, text }) => {
      const line = h('button', { type: 'button', class: 'lyrics__line' }, text || '♪');
      line.addEventListener('click', () => this.notify(EVENTS.SEEK, time));
      return { time, element: line };
    });
    if (lines.length > 0) this.#lyricsText.replaceChildren(...this.#lyricLines.map(({ element }) => element));
    else this.#lyricsText.textContent = track.lyrics ?? '';
  }

  #syncLyrics(seconds) {
    const index = activeLine(this.#lyricLines, seconds);
    if (index === this.#activeLine) return;
    this.#lyricLines[this.#activeLine]?.element.classList.remove('is-active');
    this.#lyricLines[this.#activeLine]?.element.removeAttribute('aria-current');
    this.#activeLine = index;
    this.#lyricLines[index]?.element.classList.add('is-active');
    this.#lyricLines[index]?.element.setAttribute('aria-current', 'true');
    this.#scrollToActive('smooth');
  }

  /** Centra el verso que suena dentro de la tarjeta de letra (sin mover el resto de la pantalla). */
  #scrollToActive(behavior) {
    const line = this.#lyricLines[this.#activeLine]?.element;
    const box = this.#lyricsText;
    if (!line || box.hidden) return;
    box.scrollTo({ top: line.offsetTop - (box.clientHeight - line.offsetHeight) / 2, behavior });
  }
}
