import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton, favoriteButton, setFavoriteButton, setIcon } from '../ui/dom.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { createSeekBar, createTransport, createVolumeControl } from '../ui/transport.js';

const EMPTY_TITLE = 'Nada sonando';
const EMPTY_ARTIST = 'Elige una canción de tu biblioteca';

/**
 * Player bar: el mini-player del diseño ampliado a todo el ancho
 * (pista + corazón · transporte + progreso · volumen + abrir Reproduciendo).
 * En escritorio, también el botón del mini-reproductor (y doble clic en la portada para volver de él).
 * Emite: open-now-playing, toggle-favorite, seek, toggle-mini-player, volumen y controles de transporte.
 */
export class ControlsView extends Colleague {
  #cover;
  #title;
  #artist;
  #favorite;
  #transport;
  #seek;
  #volume;
  #expand;
  #mini;
  #isMini = false;
  #currentPath = null;

  constructor(root) {
    super();
    this.#cover = h(
      'button',
      { type: 'button', class: 'player__cover', 'aria-label': 'Abrir Reproduciendo', title: 'Abrir Reproduciendo', disabled: true },
      createCover({ className: 'cover--thumb', tag: 'span' }),
    );
    // En el mini-reproductor no cabe Reproduciendo: la portada vuelve a la ventana normal.
    this.#cover.addEventListener('click', () => this.notify(this.#isMini ? EVENTS.TOGGLE_MINI_PLAYER : EVENTS.OPEN_NOW_PLAYING));
    this.#title = h('span', { class: 'player__title ellipsis' }, EMPTY_TITLE);
    this.#artist = h('span', { class: 'player__artist ellipsis' }, EMPTY_ARTIST);
    this.#favorite = favoriteButton(false, { hidden: true });
    this.#favorite.addEventListener('click', () => this.notify(EVENTS.TOGGLE_FAVORITE, this.#currentPath ?? undefined));
    this.#transport = createTransport((event) => this.notify(event));
    this.#seek = createSeekBar((seconds) => this.notify(EVENTS.SEEK, seconds));
    this.#volume = createVolumeControl((event, payload) => this.notify(event, payload));
    this.#expand = iconButton('chevron-up', 'Abrir Reproduciendo', { disabled: true });
    this.#expand.addEventListener('click', () => this.notify(EVENTS.OPEN_NOW_PLAYING));
    this.#mini = iconButton('miniplayer', 'Mini-reproductor (Ctrl+M)', { className: 'player__mini', hidden: true });
    this.#mini.addEventListener('click', () => this.notify(EVENTS.TOGGLE_MINI_PLAYER));

    root.replaceChildren(
      h(
        'div',
        { class: 'player' },
        h('div', { class: 'player__track' }, this.#cover, h('div', { class: 'player__text' }, this.#title, this.#artist), this.#favorite),
        h('div', { class: 'player__center' }, this.#transport.element, this.#seek.element),
        h('div', { class: 'player__extras' }, this.#volume.element, this.#mini, this.#expand),
      ),
    );
  }

  show(track, isFavorite) {
    this.#currentPath = track.path;
    this.#cover.replaceChildren(createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--thumb', tag: 'span' }));
    this.#cover.disabled = false;
    this.#expand.disabled = false;
    this.#title.textContent = track.title;
    this.#title.title = track.title;
    this.#artist.textContent = track.artist;
    this.#artist.title = track.artist;
    this.#favorite.hidden = false;
    setFavoriteButton(this.#favorite, isFavorite);
  }

  /** Vuelve al estado inicial ("Nada sonando"), p. ej. si desaparece el archivo de la pista. */
  clear() {
    this.#currentPath = null;
    this.#cover.replaceChildren(createCover({ className: 'cover--thumb', tag: 'span' }));
    this.#cover.disabled = true;
    this.#expand.disabled = true;
    this.#title.textContent = EMPTY_TITLE;
    this.#title.removeAttribute('title');
    this.#artist.textContent = EMPTY_ARTIST;
    this.#artist.removeAttribute('title');
    this.#favorite.hidden = true;
    this.#transport.setPlaying(false);
    this.#seek.setProgress(0, 0);
  }

  setPlaying(playing) {
    this.#transport.setPlaying(playing);
  }

  setProgress(current, duration) {
    this.#seek.setProgress(current, duration);
  }

  setModes(modes) {
    this.#transport.setModes(modes);
  }

  setVolume(volume, muted) {
    this.#volume.setVolume(volume, muted);
  }

  setFavorite(path, isFavorite) {
    if (path === this.#currentPath) setFavoriteButton(this.#favorite, isFavorite);
  }

  /** El botón del mini-reproductor solo existe en escritorio. */
  setMiniAvailable(available) {
    this.#mini.hidden = !available;
  }

  setMini(mini) {
    this.#isMini = mini;
    const label = mini ? 'Volver a la ventana (Ctrl+M)' : 'Mini-reproductor (Ctrl+M)';
    setIcon(this.#mini, mini ? 'maximize' : 'miniplayer');
    this.#mini.setAttribute('aria-label', label);
    this.#mini.title = label;
    const cover = mini ? 'Volver a la ventana' : 'Abrir Reproduciendo';
    this.#cover.setAttribute('aria-label', cover);
    this.#cover.title = cover;
  }
}
