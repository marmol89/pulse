import { h, favoriteButton, setFavoriteButton } from './dom.js';
import { icon } from './icons.js';
import { createCover, trackSeed } from './cover.js';
import { formatTime } from './format.js';

/**
 * Lista de pistas (filas de 60 px de la pantalla Playlist). Componente de UI,
 * no colega: avisa a su vista con callbacks y la vista notifica al mediator.
 * Doble clic, Enter o el botón sobre la portada reproducen.
 */
export class TrackList {
  #element;
  #rows = new Map();
  #currentPath = null;

  constructor({ onPlay, onToggleFavorite, label = 'Canciones' }) {
    this.#element = h('ol', { class: 'track-list', 'aria-label': label });
    this.#element.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const { path } = button.closest('.track-row').dataset;
      if (button.dataset.action === 'play') onPlay(path);
      else onToggleFavorite(path);
    });
    this.#element.addEventListener('dblclick', (event) => {
      const row = event.target.closest('.track-row');
      if (row && !event.target.closest('button')) onPlay(row.dataset.path);
    });
    this.#element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.classList.contains('track-row')) {
        event.preventDefault();
        onPlay(event.target.dataset.path);
      }
    });
  }

  get element() {
    return this.#element;
  }

  /** @param {object[]} tracks @param {{ favorites?: Set<string>, currentPath?: string|null, playing?: boolean }} state */
  render(tracks, { favorites = new Set(), currentPath = null, playing = false } = {}) {
    this.#rows.clear();
    this.#currentPath = null;
    const fragment = document.createDocumentFragment();
    for (const track of tracks) {
      const row = this.#createRow(track, favorites.has(track.path));
      this.#rows.set(track.path, row);
      fragment.append(row);
    }
    this.#element.replaceChildren(fragment);
    this.highlight(currentPath);
    this.setPlaying(playing);
  }

  highlight(path) {
    const previous = this.#rows.get(this.#currentPath);
    previous?.classList.remove('is-active');
    previous?.removeAttribute('aria-current');
    this.#currentPath = path;
    const row = this.#rows.get(path);
    row?.classList.add('is-active');
    row?.setAttribute('aria-current', 'true');
  }

  setPlaying(playing) {
    this.#element.classList.toggle('is-playing', playing);
  }

  setFavorite(path, isFavorite) {
    const button = this.#rows.get(path)?.querySelector('[data-action="favorite"]');
    if (button) setFavoriteButton(button, isFavorite);
  }

  #createRow(track, isFavorite) {
    const cover = createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--row' });
    cover.append(
      h('button', { type: 'button', class: 'cover__play', 'data-action': 'play', tabindex: '-1', 'aria-label': `Reproducir ${track.title}` }, icon('play')),
    );
    return h(
      'li',
      { class: 'track-row', tabindex: '0', 'data-path': track.path, title: `${track.title} · ${track.artist}` },
      cover,
      h('div', { class: 'track-row__text' }, h('span', { class: 'track-row__title' }, track.title), h('span', { class: 'track-row__artist' }, track.artist)),
      favoriteButton(isFavorite, { 'data-action': 'favorite', tabindex: '-1' }),
      h(
        'span',
        { class: 'track-row__end' },
        h('span', { class: 'equalizer', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('span', { class: 'track-row__duration' }, track.duration ? formatTime(track.duration) : ''),
      ),
    );
  }
}
