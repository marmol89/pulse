import { h, favoriteButton, iconButton, setFavoriteButton } from './dom.js';
import { icon } from './icons.js';
import { createCover, trackSeed } from './cover.js';
import { formatTime } from './format.js';
import { showMenu } from './menu.js';
import { enableReorder } from './reorder.js';

/**
 * Lista de pistas (filas de 60 px de la pantalla Playlist). Componente de UI,
 * no colega: avisa a su vista con callbacks y la vista notifica al mediator.
 * Doble clic, Enter o el botón sobre la portada reproducen. Con `onAddToList`, cada fila tiene
 * "Añadir a una lista"; con `onPlayNext` y `onEnqueue`, un menú "⋯" con "Reproducir a continuación" y
 * "Añadir a la cola"; con `onRemove` y `removable` al pintar (su texto: "Quitar de la lista"), el botón de quitar;
 * con `onMove` y `reorderable` al pintar, un asa para arrastrar las filas (y Alt+↑/↓).
 */
export class TrackList {
  #element;
  #rows = new Map();
  /** Pistas que muestra, en orden (para recalcular datos de la vista al quitar filas). */
  #tracks = new Map();
  #currentPath = null;
  #canAdd;
  #canQueue;
  #removable = '';
  #reorderable = false;

  constructor({ onPlay, onToggleFavorite, onAddToList = null, onPlayNext = null, onEnqueue = null, onRemove = () => {}, onMove = null, label = 'Canciones' }) {
    this.#canAdd = Boolean(onAddToList);
    this.#canQueue = Boolean(onPlayNext && onEnqueue);
    const more = (path, button) =>
      showMenu(
        button,
        [
          { label: 'Reproducir a continuación', icon: 'next', onSelect: () => onPlayNext(path) },
          { label: 'Añadir a la cola', icon: 'queue-add', onSelect: () => onEnqueue(path) },
        ],
        { label: `Opciones de ${this.#tracks.get(path)?.title ?? 'la canción'}` },
      );
    const actions = { play: onPlay, favorite: onToggleFavorite, add: onAddToList, remove: onRemove, more };
    this.#element = h('ol', { class: 'track-list', 'aria-label': label });
    this.#element.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      actions[button.dataset.action]?.(button.closest('.track-row').dataset.path, button);
    });
    this.#element.addEventListener('dblclick', (event) => {
      const row = event.target.closest('.track-row');
      if (row && !event.target.closest('button')) onPlay(row.dataset.path);
    });
    if (onMove) enableReorder(this.#element, { onMove, enabled: () => this.#reorderable });
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

  /**
   * @param {object[]} tracks
   * @param {{ favorites?: Set<string>, currentPath?: string|null, playing?: boolean, removable?: boolean|string, reorderable?: boolean }} state
   * `removable`: el texto del botón de quitar (con `true`, "Quitar de la lista").
   */
  render(tracks, { favorites = new Set(), currentPath = null, playing = false, removable = false, reorderable = false } = {}) {
    this.#removable = removable === true ? 'Quitar de la lista' : removable || '';
    this.#reorderable = reorderable;
    // Al repintar (p. ej. tras mover una fila con el teclado) el foco sigue en la misma pista.
    const focusedPath = this.#element.contains(document.activeElement) ? document.activeElement.closest('.track-row')?.dataset.path : null;
    this.#rows.clear();
    this.#tracks.clear();
    this.#currentPath = null;
    const fragment = document.createDocumentFragment();
    for (const track of tracks) {
      const row = this.#createRow(track, favorites.has(track.path));
      this.#rows.set(track.path, row);
      this.#tracks.set(track.path, track);
      fragment.append(row);
    }
    this.#element.replaceChildren(fragment);
    this.#element.classList.toggle('is-reorderable', reorderable);
    if (focusedPath) this.#rows.get(focusedPath)?.focus();
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

  /** Repinta solo la fila de una pista actualizada (p. ej. con su carátula de internet). */
  updateTrack(track, isFavorite) {
    const row = this.#rows.get(track.path);
    if (!row) return;
    const focused = row.contains(document.activeElement);
    const next = this.#createRow(track, isFavorite);
    if (track.path === this.#currentPath) {
      next.classList.add('is-active');
      next.setAttribute('aria-current', 'true');
    }
    row.replaceWith(next);
    this.#rows.set(track.path, next);
    this.#tracks.set(track.path, track);
    if (focused) next.focus();
  }

  /** Quita las filas de esas pistas (p. ej. archivos que ya no existen). */
  removeTracks(paths) {
    for (const path of paths) {
      this.#rows.get(path)?.remove();
      this.#rows.delete(path);
      this.#tracks.delete(path);
      if (path === this.#currentPath) this.#currentPath = null;
    }
  }

  /** Pistas que muestra ahora, en orden. */
  tracks() {
    return [...this.#tracks.values()];
  }

  #createRow(track, isFavorite) {
    const cover = createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--row' });
    cover.append(
      h('button', { type: 'button', class: 'cover__play', 'data-action': 'play', tabindex: '-1', 'aria-label': `Reproducir ${track.title}` }, icon('play')),
    );
    return h(
      'li',
      { class: 'track-row', tabindex: '0', 'data-path': track.path, title: `${track.title} · ${track.artist}` },
      this.#reorderable && h('span', { class: 'track-row__grip', title: 'Arrastra para cambiar el orden (o Alt+↑/↓)', 'aria-hidden': 'true' }, icon('grip')),
      cover,
      h('div', { class: 'track-row__text' }, h('span', { class: 'track-row__title' }, track.title), h('span', { class: 'track-row__artist' }, track.artist)),
      h(
        'span',
        { class: 'track-row__actions' },
        this.#removable && iconButton('close', this.#removable, { className: 'row-action row-action--remove', 'data-action': 'remove', tabindex: '-1' }),
        this.#canAdd && iconButton('plus', 'Añadir a una lista', { className: 'row-action', 'data-action': 'add', tabindex: '-1' }),
        this.#canQueue && iconButton('more', 'Más opciones', { className: 'row-action', 'data-action': 'more', 'aria-haspopup': 'menu', 'aria-expanded': 'false', tabindex: '-1' }),
        favoriteButton(isFavorite, { 'data-action': 'favorite', tabindex: '-1' }),
      ),
      h(
        'span',
        { class: 'track-row__end' },
        h('span', { class: 'equalizer', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('span', { class: 'track-row__duration' }, track.duration ? formatTime(track.duration) : ''),
      ),
    );
  }
}
