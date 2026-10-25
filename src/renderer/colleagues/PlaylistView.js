import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover } from '../ui/cover.js';
import { collectionStats } from '../ui/format.js';
import { TrackList } from '../ui/trackList.js';

const KIND_LABELS = {
  library: 'Biblioteca',
  album: 'Álbum',
  artist: 'Artista',
  genre: 'Género',
  search: 'Búsqueda',
  favorites: 'Favoritos',
  recents: 'Recientes',
  queue: 'Cola',
  mix: 'Para ti',
  list: 'Lista',
};
const EMPTY_MESSAGES = {
  library: 'Tu biblioteca está vacía. Sube canciones a tu bucket y pulsa «Actualizar biblioteca» en la barra lateral.',
  favorites: 'Aún no tienes favoritos. Pulsa el corazón de cualquier canción para guardarla aquí.',
  recents: 'Todavía no has escuchado nada.',
  queue: 'La cola está vacía.',
  list: 'Esta lista está vacía. Pulsa «+» en cualquier canción (o «Añadir a una lista» en Reproduciendo) para añadirla.',
};
/** Colecciones de las que se pueden quitar canciones, con el texto del botón. */
const REMOVE_LABELS = { list: 'Quitar de la lista', queue: 'Quitar de la cola' };
/** Colecciones cuya portada es la carátula de sus pistas; el resto usa una generada. */
const TRACK_COVER_KINDS = new Set(['album', 'artist']);

/**
 * Pantalla 03 · Playlist: cabecera (portada, título, autor, estadísticas),
 * aleatorio + play y la lista de pistas de cualquier colección.
 * En una lista del usuario, además: "Editar lista" y quitar canciones.
 * Emite: navigate-back, play-collection, toggle-shuffle, track-selected, toggle-favorite, choose-list,
 * edit-list, remove-from-list, play-next, enqueue, remove-from-queue.
 */
export class PlaylistView extends Colleague {
  #source = null;
  #cover;
  #eyebrow;
  #title;
  #byline;
  #stats;
  #shuffle;
  #play;
  #edit;
  #list;
  #empty;

  constructor(root) {
    super();
    const back = iconButton('back', 'Volver', { className: 'back-button' });
    back.addEventListener('click', () => this.notify(EVENTS.NAVIGATE_BACK));
    this.#cover = h('div', { class: 'collection-header__cover' });
    this.#eyebrow = h('span', { class: 'eyebrow' });
    this.#title = h('h1', { class: 'collection-header__title' });
    this.#byline = h('span');
    this.#stats = h('p', { class: 'collection-header__stats' });
    this.#shuffle = iconButton('shuffle', 'Aleatorio', { className: 'mode-button', 'aria-pressed': 'false' });
    this.#shuffle.addEventListener('click', () => this.notify(EVENTS.TOGGLE_SHUFFLE));
    this.#play = h('button', { type: 'button', class: 'play-button play-button--gradient', 'aria-label': 'Reproducir', title: 'Reproducir' }, icon('play'));
    this.#play.addEventListener('click', () => {
      if (this.#source) this.notify(EVENTS.PLAY_COLLECTION, this.#source);
    });
    this.#edit = h('button', { type: 'button', class: 'button button--secondary collection-actions__edit', hidden: true }, icon('pencil'), 'Editar lista');
    this.#edit.addEventListener('click', () => this.notify(EVENTS.EDIT_LIST, this.#source.id));
    this.#list = new TrackList({
      onPlay: (path) => this.notify(EVENTS.TRACK_SELECTED, { source: this.#source, path }),
      onToggleFavorite: (path) => this.notify(EVENTS.TOGGLE_FAVORITE, path),
      onAddToList: (path) => this.notify(EVENTS.CHOOSE_LIST, path),
      onPlayNext: (path) => this.notify(EVENTS.PLAY_NEXT, [path]),
      onEnqueue: (path) => this.notify(EVENTS.ENQUEUE, [path]),
      onRemove: (path) =>
        this.#source.kind === 'queue' ? this.notify(EVENTS.REMOVE_FROM_QUEUE, path) : this.notify(EVENTS.REMOVE_FROM_LIST, { id: this.#source.id, path }),
    });
    this.#empty = h('p', { class: 'hint', hidden: true });

    root.replaceChildren(
      back,
      h(
        'header',
        { class: 'collection-header' },
        this.#cover,
        h(
          'div',
          { class: 'collection-header__info' },
          this.#eyebrow,
          this.#title,
          h('div', { class: 'byline' }, h('span', { class: 'byline__avatar', 'aria-hidden': 'true' }), this.#byline),
          this.#stats,
        ),
      ),
      h('div', { class: 'collection-actions' }, this.#edit, this.#shuffle, this.#play),
      this.#list.element,
      this.#empty,
    );
  }

  /** @param {{ source, title, byline, tracks }} collection @param {{ favorites, currentPath, playing }} state */
  render(collection, state) {
    const { source, title, byline, tracks } = collection;
    this.#source = source;
    const sample = TRACK_COVER_KINDS.has(source.kind) ? (tracks.find((track) => track.cover) ?? null) : null;
    // La foto del artista, si la hay; si no, la carátula de una de sus canciones.
    const src = collection.cover ?? sample?.cover ?? null;
    this.#cover.replaceChildren(createCover({ src, seed: title, className: 'cover--collection' }));
    this.#eyebrow.textContent = KIND_LABELS[source.kind] ?? '';
    this.#title.textContent = title;
    this.#byline.textContent = byline;
    this.#stats.textContent = collectionStats(tracks);
    const isList = source.kind === 'list';
    this.#edit.hidden = !isList;
    this.#list.render(tracks, { ...state, removable: REMOVE_LABELS[source.kind] ?? false });
    this.#empty.hidden = tracks.length > 0;
    this.#empty.textContent = EMPTY_MESSAGES[source.kind] ?? 'No hay canciones aquí.';
    this.#play.disabled = tracks.length === 0;
  }

  /** Colección visible (para repintarla si cambia la biblioteca). */
  source() {
    return this.#source;
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

  /** Quita filas y actualiza "N canciones · duración" y el estado vacío. */
  removeTracks(paths) {
    this.#list.removeTracks(paths);
    const tracks = this.#list.tracks();
    this.#stats.textContent = collectionStats(tracks);
    this.#empty.hidden = tracks.length > 0;
    this.#play.disabled = tracks.length === 0;
  }

  setModes({ shuffle }) {
    this.#shuffle.classList.toggle('is-active', shuffle);
    this.#shuffle.setAttribute('aria-pressed', String(shuffle));
  }
}
