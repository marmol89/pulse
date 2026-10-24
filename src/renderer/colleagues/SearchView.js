import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { TrackList } from '../ui/trackList.js';

const DEBOUNCE_MS = 150;
const DEFAULT_HINT = 'Busca entre las canciones de tu biblioteca por título, artista o álbum.';

/**
 * Buscar: campo de búsqueda y resultados. Esc borra la búsqueda.
 * Emite: search, track-selected, toggle-favorite.
 */
export class SearchView extends Colleague {
  #input;
  #hint;
  #list;
  #query = '';
  #timer = 0;

  constructor(root) {
    super();
    this.#input = h('input', {
      type: 'search',
      class: 'search-box__input',
      placeholder: 'Canciones, artistas o álbumes',
      'aria-label': 'Buscar en tu biblioteca',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.#input.addEventListener('input', () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.notify(EVENTS.SEARCH, this.#input.value), DEBOUNCE_MS);
    });
    this.#input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.#input.value) return;
      event.preventDefault();
      this.#input.value = '';
      this.notify(EVENTS.SEARCH, '');
    });
    this.#hint = h('p', { class: 'hint' }, DEFAULT_HINT);
    this.#list = new TrackList({
      label: 'Resultados',
      onPlay: (path) => this.notify(EVENTS.TRACK_SELECTED, { source: { kind: 'search', key: this.#query }, path }),
      onToggleFavorite: (path) => this.notify(EVENTS.TOGGLE_FAVORITE, path),
    });
    root.replaceChildren(
      h('h1', { class: 'view-title' }, 'Buscar'),
      h('label', { class: 'search-box' }, icon('search'), this.#input),
      this.#hint,
      this.#list.element,
    );
  }

  focus() {
    this.#input.focus();
    this.#input.select();
  }

  showResults(query, tracks, state) {
    this.#query = query;
    const text = query.trim();
    this.#hint.hidden = text !== '' && tracks.length > 0;
    this.#hint.textContent = text ? `No hay resultados para «${text}».` : DEFAULT_HINT;
    this.#list.render(text ? tracks : [], state);
  }

  highlight(path) {
    this.#list.highlight(path);
  }

  setPlaying(playing) {
    this.#list.setPlaying(playing);
  }

  setFavorite(path, isFavorite) {
    this.#list.setFavorite(path, isFavorite);
  }

  updateTrack(track, isFavorite) {
    this.#list.updateTrack(track, isFavorite);
  }

  removeTracks(paths) {
    this.#list.removeTracks(paths);
    const text = this.#query.trim();
    if (text && this.#list.tracks().length === 0) {
      this.#hint.hidden = false;
      this.#hint.textContent = `No hay resultados para «${text}».`;
    }
  }
}
