import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton, favoriteButton, setFavoriteButton } from '../ui/dom.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { createSeekBar, createTransport, createVolumeControl } from '../ui/transport.js';

/**
 * Player bar: el mini-player del diseño ampliado a todo el ancho
 * (pista + corazón · transporte + progreso · volumen + abrir Reproduciendo).
 * Emite: open-now-playing, toggle-favorite, seek, volumen y controles de transporte.
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
  #currentPath = null;

  constructor(root) {
    super();
    this.#cover = h(
      'button',
      { type: 'button', class: 'player__cover', 'aria-label': 'Abrir Reproduciendo', title: 'Abrir Reproduciendo', disabled: true },
      createCover({ className: 'cover--thumb', tag: 'span' }),
    );
    this.#cover.addEventListener('click', () => this.notify(EVENTS.OPEN_NOW_PLAYING));
    this.#title = h('span', { class: 'player__title ellipsis' }, 'Nada sonando');
    this.#artist = h('span', { class: 'player__artist ellipsis' }, 'Elige una canción de tu biblioteca');
    this.#favorite = favoriteButton(false, { hidden: true });
    this.#favorite.addEventListener('click', () => this.notify(EVENTS.TOGGLE_FAVORITE, this.#currentPath ?? undefined));
    this.#transport = createTransport((event) => this.notify(event));
    this.#seek = createSeekBar((seconds) => this.notify(EVENTS.SEEK, seconds));
    this.#volume = createVolumeControl((event, payload) => this.notify(event, payload));
    this.#expand = iconButton('chevron-up', 'Abrir Reproduciendo', { disabled: true });
    this.#expand.addEventListener('click', () => this.notify(EVENTS.OPEN_NOW_PLAYING));

    root.replaceChildren(
      h(
        'div',
        { class: 'player' },
        h('div', { class: 'player__track' }, this.#cover, h('div', { class: 'player__text' }, this.#title, this.#artist), this.#favorite),
        h('div', { class: 'player__center' }, this.#transport.element, this.#seek.element),
        h('div', { class: 'player__extras' }, this.#volume.element, this.#expand),
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
}
