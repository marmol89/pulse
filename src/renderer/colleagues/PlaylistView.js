import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h, iconButton } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover } from '../ui/cover.js';
import { collectionStats } from '../ui/format.js';
import { TrackList } from '../ui/trackList.js';
import { showMenu } from '../ui/menu.js';

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
  library: 'Tu biblioteca está vacía. Sube canciones a tu bucket (o añádelas a tus carpetas) y pulsa «Actualizar biblioteca» en la barra lateral.',
  favorites: 'Aún no tienes favoritos. Pulsa el corazón de cualquier canción para guardarla aquí.',
  recents: 'Todavía no has escuchado nada.',
  queue: 'La cola está vacía.',
  list: 'Esta lista está vacía. Usa «Añadir a una lista» en el menú «⋯» de cualquier canción (o en Reproduciendo) para añadirla.',
};
/** Órdenes de "Tu biblioteca" (los aplica Catalog); el primero es el de siempre. */
const LIBRARY_SORTS = [
  ['added', 'Añadidas recientemente'],
  ['title', 'Título'],
  ['artist', 'Artista'],
  ['album', 'Álbum'],
  ['year', 'Año'],
];

/** Colecciones de las que se pueden quitar canciones (y cambiar su orden), con el texto del botón. */
const REMOVE_LABELS = { list: 'Quitar de la lista', queue: 'Quitar de la cola' };
/** Colecciones cuya portada es la carátula de sus pistas; el resto usa una generada. */
const TRACK_COVER_KINDS = new Set(['album', 'artist']);

/**
 * Pantalla 03 · Playlist: cabecera (portada, título, autor, estadísticas),
 * aleatorio + play y la lista de pistas de cualquier colección.
 * En una lista del usuario, además: "Editar lista" y quitar canciones.
 * Emite: navigate-back, play-collection, toggle-shuffle, track-selected, toggle-favorite, choose-list,
 * edit-list, remove-from-list, move-in-list, play-next, enqueue, remove-from-queue, move-in-queue.
 * En "Tu biblioteca": sort-library y filter-library.
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
  #more;
  #download;
  #tools;
  #filter;
  #sort;
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
    // En el móvil "Editar lista" no cabe junto a los demás: va dentro de este "⋯".
    this.#more = iconButton('more', 'Más opciones de la lista', { className: 'collection-actions__more', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    this.#more.addEventListener('click', () =>
      showMenu(this.#more, [{ label: 'Editar lista', icon: 'pencil', onSelect: () => this.notify(EVENTS.EDIT_LIST, this.#source.id) }], { label: 'Opciones de la lista' }),
    );
    this.#download = h('button', { type: 'button', class: 'button button--secondary collection-actions__download', hidden: true });
    this.#download.addEventListener('click', () =>
      this.notify(this.#download.dataset.state === 'all' ? EVENTS.REMOVE_DOWNLOADS : EVENTS.DOWNLOAD_COLLECTION, this.#source),
    );
    this.#filter = h('input', { type: 'search', class: 'library-tools__input', placeholder: 'Filtrar canciones', 'aria-label': 'Filtrar canciones', spellcheck: 'false' });
    this.#filter.addEventListener('input', () => this.notify(EVENTS.FILTER_LIBRARY, this.#filter.value));
    this.#sort = h('select', { class: 'library-tools__sort', 'aria-label': 'Ordenar por' }, ...LIBRARY_SORTS.map(([value, label]) => h('option', { value }, label)));
    this.#sort.addEventListener('change', () => this.notify(EVENTS.SORT_LIBRARY, this.#sort.value));
    this.#tools = h(
      'div',
      { class: 'library-tools', hidden: true },
      h('label', { class: 'library-tools__filter' }, icon('search'), this.#filter),
      h('label', { class: 'library-tools__order' }, h('span', { class: 'library-tools__label' }, 'Ordenar por'), this.#sort),
    );
    this.#list = new TrackList({
      onPlay: (path) => this.notify(EVENTS.TRACK_SELECTED, { source: this.#source, path }),
      onToggleFavorite: (path) => this.notify(EVENTS.TOGGLE_FAVORITE, path),
      onAddToList: (path) => this.notify(EVENTS.CHOOSE_LIST, path),
      onPlayNext: (path) => this.notify(EVENTS.PLAY_NEXT, [path]),
      onTrash: (path) => this.notify(EVENTS.TRASH_TRACK, path),
      onEnqueue: (path) => this.notify(EVENTS.ENQUEUE, [path]),
      onMove: (path, to) =>
        this.#source.kind === 'queue' ? this.notify(EVENTS.MOVE_IN_QUEUE, { path, to }) : this.notify(EVENTS.MOVE_IN_LIST, { id: this.#source.id, path, to }),
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
      h('div', { class: 'collection-actions' }, this.#more, this.#edit,this.#tools, this.#download, this.#shuffle, this.#play),
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
    this.#more.hidden = !isList;
    this.#renderDownload(state.download ?? null, tracks.length);
    this.#renderTools(source);
    this.#list.render(tracks, { ...state, removable: REMOVE_LABELS[source.kind] ?? false, reorderable: source.kind in REMOVE_LABELS });
    this.#empty.hidden = tracks.length > 0;
    this.#empty.textContent = source.filter?.trim()
      ? `Ninguna canción coincide con «${source.filter.trim()}».`
      : (EMPTY_MESSAGES[source.kind] ?? 'No hay canciones aquí.');
    this.#play.disabled = tracks.length === 0;
  }

  /** "Descargar" (sin conexión) en las colecciones que lo admiten; `download`: 'none' | 'downloading' | 'all' o null. */
  #renderDownload(download, count) {
    this.#download.hidden = !download || count === 0;
    if (this.#download.hidden) return;
    const labels = { none: ['download', 'Descargar'], downloading: ['download', 'Descargando…'], all: ['downloaded', 'Descargada'] };
    const [name, label] = labels[download] ?? labels.none;
    this.#download.dataset.state = download;
    this.#download.disabled = download === 'downloading';
    this.#download.setAttribute('aria-pressed', String(download === 'all'));
    this.#download.title = download === 'all' ? 'Quitar la descarga del móvil' : 'Guardar en el móvil para escucharla sin conexión';
    // En el móvil solo se ve el icono: el texto sigue siendo su nombre accesible.
    this.#download.setAttribute('aria-label', label);
    this.#download.replaceChildren(icon(name), h('span', { class: 'button__label' }, label));
  }

  /** Filtro y orden solo en "Tu biblioteca"; al entrar de nuevo, el filtro empieza vacío. */
  #renderTools(source) {
    const isLibrary = source.kind === 'library';
    this.#tools.hidden = !isLibrary;
    if (!isLibrary) return;
    const filter = source.filter ?? '';
    if (this.#filter.value !== filter) this.#filter.value = filter; // sin mover el cursor mientras se escribe
    this.#sort.value = source.sort ?? LIBRARY_SORTS[0][0];
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
