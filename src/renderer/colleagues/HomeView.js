import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { greeting, plural } from '../ui/format.js';
import { TrackList } from '../ui/trackList.js';

const FILTERS = [
  ['all', 'Todo'],
  ['lists', 'Listas'],
  ['albums', 'Álbumes'],
  ['artists', 'Artistas'],
  ['favorites', 'Favoritos'],
];
const RECENTS_LIMIT = 8;

/**
 * Pantalla 01 · Inicio: saludo, chips, "Mix diario", "Tus listas", "Hechas para ti" (listas inteligentes),
 * "Escuchado recientemente" y géneros. El filtro de los chips es estado de la vista; los datos llegan en render().
 * Emite: play-mix, track-selected, open-collection, toggle-favorite, open-connection, sync-library,
 * new-list, choose-list, play-next, enqueue, edit-track, trash-track.
 */
export class HomeView extends Colleague {
  #greeting;
  #chips = new Map();
  #content;
  #favorites;
  #filter = 'all';
  #data = null;

  constructor(root) {
    super();
    this.#greeting = h('h1', { class: 'greeting' }, greeting());
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar Inicio' });
    for (const [filter, label] of FILTERS) {
      const chip = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === this.#filter) }, label);
      chip.addEventListener('click', () => this.#setFilter(filter));
      this.#chips.set(filter, chip);
      chips.append(chip);
    }
    this.#content = h('div', { class: 'home-content' });
    this.#favorites = new TrackList({
      label: 'Tus favoritos',
      onPlay: (path) => this.notify(EVENTS.TRACK_SELECTED, { source: { kind: 'favorites' }, path }),
      onToggleFavorite: (path) => this.notify(EVENTS.TOGGLE_FAVORITE, path),
      onAddToList: (path) => this.notify(EVENTS.CHOOSE_LIST, path),
      onPlayNext: (path) => this.notify(EVENTS.PLAY_NEXT, [path]),
      onEdit: (path) => this.notify(EVENTS.EDIT_TRACK, path),
      onTrash: (path) => this.notify(EVENTS.TRASH_TRACK, path),
      onEnqueue: (path) => this.notify(EVENTS.ENQUEUE, [path]),
    });
    root.replaceChildren(h('header', { class: 'home-header' }, this.#greeting), chips, this.#content);
  }

  /**
   * @param {{ isEmpty, recents, genres, albums, artists, favoriteTracks, lists, smart, favorites, currentPath, playing, readOnly }} data
   *   `lists`: [{ id, name, count, sample }] (sample: una pista para la portada, o null)
   *   `smart`: [{ kind, title, count, sample }] listas inteligentes con alguna canción
   */
  render(data) {
    this.#data = data;
    this.#greeting.textContent = greeting();
    this.#renderContent();
  }

  highlight(path) {
    this.#favorites.highlight(path);
  }

  setPlaying(playing) {
    this.#favorites.setPlaying(playing);
  }

  setFavorite(path, isFavorite) {
    this.#favorites.setFavorite(path, isFavorite);
  }

  updateTrack(track, isFavorite) {
    this.#favorites.updateTrack(track, isFavorite);
  }

  removeTracks(paths) {
    this.#favorites.removeTracks(paths);
  }

  #setFilter(filter) {
    this.#filter = filter;
    for (const [name, chip] of this.#chips) chip.setAttribute('aria-pressed', String(name === filter));
    this.#renderContent();
  }

  #renderContent() {
    const data = this.#data;
    if (!data) return;
    if (data.isEmpty) {
      this.#content.replaceChildren(this.#welcome(data.readOnly));
      return;
    }
    const sections = {
      all: () => [this.#mixCard(), this.#listsSection(data.lists), this.#smartSection(data.smart), this.#recentsSection(data.recents), this.#genreCards(data.genres)],
      lists: () => [h('div', { class: 'card-grid' }, data.lists.map((list) => this.#listCard(list)), this.#newListCard())],
      albums: () => [this.#albumGrid(data.albums)],
      artists: () => [this.#artistGrid(data.artists)],
      favorites: () => [this.#favoritesList(data)],
    };
    this.#content.replaceChildren(...sections[this.#filter]().filter(Boolean));
  }

  #mixCard() {
    const play = h(
      'button',
      { type: 'button', class: 'play-button play-button--feature', 'aria-label': 'Reproducir Mix diario', title: 'Reproducir Mix diario' },
      icon('play'),
    );
    play.addEventListener('click', () => this.notify(EVENTS.PLAY_MIX));
    return h(
      'article',
      { class: 'feature-card' },
      h('span', { class: 'eyebrow' }, 'Para ti'),
      h('h2', { class: 'feature-card__title' }, 'Mix diario'),
      h('p', { class: 'feature-card__text' }, 'Tus favoritos y nuevos descubrimientos, en orden aleatorio'),
      play,
    );
  }

  #recentsSection(recents) {
    if (recents.length === 0) return null;
    const seeAll = h('button', { type: 'button', class: 'link-button' }, 'Ver todo');
    seeAll.addEventListener('click', () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'recents' }));
    const cards = recents.slice(0, RECENTS_LIMIT).map((track) =>
      this.#card({
        cover: createCover({ src: track.cover, seed: trackSeed(track), className: 'cover--card', tag: 'span' }),
        title: track.title,
        subtitle: track.artist,
        onClick: () => this.notify(EVENTS.TRACK_SELECTED, { source: { kind: 'recents' }, path: track.path }),
      }),
    );
    return h(
      'section',
      { class: 'section', 'aria-label': 'Escuchado recientemente' },
      h('header', { class: 'section__header' }, h('h2', { class: 'section__title' }, 'Escuchado recientemente'), seeAll),
      h('div', { class: 'card-grid' }, cards),
    );
  }

  #listsSection(lists) {
    const seeAll = h('button', { type: 'button', class: 'link-button' }, 'Ver todas');
    seeAll.addEventListener('click', () => this.#setFilter('lists'));
    return h(
      'section',
      { class: 'section', 'aria-label': 'Tus listas' },
      h('header', { class: 'section__header' }, h('h2', { class: 'section__title' }, 'Tus listas'), lists.length > 0 && seeAll),
      h('div', { class: 'card-grid' }, lists.slice(0, RECENTS_LIMIT - 1).map((list) => this.#listCard(list)), this.#newListCard()),
    );
  }

  /** "Hechas para ti": se rehacen solas con lo que escuchas y lo que subes. */
  #smartSection(smart = []) {
    if (smart.length === 0) return null;
    return h(
      'section',
      { class: 'section', 'aria-label': 'Hechas para ti' },
      h('header', { class: 'section__header' }, h('h2', { class: 'section__title' }, 'Hechas para ti')),
      h('div', { class: 'card-grid' }, smart.map((list) => this.#smartCard(list))),
    );
  }

  #smartCard({ kind, title, count, sample }) {
    return this.#card({
      cover: createCover({ src: sample?.cover ?? null, seed: kind, className: 'cover--card', tag: 'span' }),
      title,
      subtitle: plural(count, 'canción', 'canciones'),
      onClick: () => this.notify(EVENTS.OPEN_COLLECTION, { kind }),
    });
  }

  #listCard(list) {
    return this.#card({
      cover: createCover({ src: list.sample?.cover ?? null, seed: list.name, className: 'cover--card', tag: 'span' }),
      title: list.name,
      subtitle: plural(list.count, 'canción', 'canciones'),
      onClick: () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'list', id: list.id }),
    });
  }

  /** Tarjeta "Nueva lista": la portada es un "+" sobre la superficie. */
  #newListCard() {
    return this.#card({
      cover: h('span', { class: 'cover cover--card cover--new' }, icon('plus')),
      title: 'Nueva lista',
      subtitle: 'Junta tus canciones',
      onClick: () => this.notify(EVENTS.NEW_LIST),
    });
  }

  #genreCards(genres) {
    if (genres.length === 0) return null;
    return h(
      'div',
      { class: 'genre-grid', role: 'group', 'aria-label': 'Géneros' },
      genres.map(({ name }) => {
        const card = h('button', { type: 'button', class: 'genre-card ellipsis', title: name }, name);
        card.addEventListener('click', () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'genre', key: name }));
        return card;
      }),
    );
  }

  #albumGrid(albums) {
    if (albums.length === 0) return h('p', { class: 'hint' }, 'Aún no hay álbumes: tus canciones no tienen el álbum en sus etiquetas.');
    return h(
      'div',
      { class: 'card-grid' },
      albums.map((album) =>
        this.#card({
          cover: createCover({ src: album.sample.cover, seed: trackSeed(album.sample), className: 'cover--card', tag: 'span' }),
          title: album.title,
          subtitle: album.artist,
          onClick: () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'album', key: album.key }),
        }),
      ),
    );
  }

  #artistGrid(artists) {
    return h(
      'div',
      { class: 'card-grid' },
      artists.map((artist) =>
        this.#card({
          cover: createCover({ src: artist.picture ?? artist.sample.cover, seed: artist.name, className: 'cover--card cover--round', tag: 'span' }),
          title: artist.name,
          subtitle: plural(artist.count, 'canción', 'canciones'),
          round: true,
          onClick: () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'artist', key: artist.key }),
        }),
      ),
    );
  }

  #favoritesList({ favoriteTracks, favorites, currentPath, playing, readOnly }) {
    if (favoriteTracks.length === 0) {
      return h('p', { class: 'hint' }, 'Aún no tienes favoritos. Pulsa el corazón de cualquier canción para guardarla aquí.');
    }
    this.#favorites.render(favoriteTracks, { favorites, currentPath, playing, readOnly });
    return this.#favorites.element;
  }

  #card({ cover, title, subtitle, onClick, round = false }) {
    const card = h(
      'button',
      { type: 'button', class: round ? 'media-card media-card--round' : 'media-card', title: `${title} · ${subtitle}` },
      cover,
      h('span', { class: 'media-card__title ellipsis' }, title),
      h('span', { class: 'media-card__subtitle ellipsis' }, subtitle),
    );
    card.addEventListener('click', onClick);
    return card;
  }

  /** `readOnly`: la música sale de carpetas del equipo (no se suben canciones). */
  #welcome(readOnly) {
    const connect = h('button', { type: 'button', class: 'button button--primary' }, icon('cloud'), readOnly ? 'Elegir mis carpetas' : 'Conectar mi música');
    const upload = h('button', { type: 'button', class: 'button button--secondary', hidden: readOnly }, icon('upload'), 'Subir canciones');
    const refresh = h('button', { type: 'button', class: 'button button--secondary' }, icon('refresh'), 'Actualizar biblioteca');
    connect.addEventListener('click', () => this.notify(EVENTS.OPEN_CONNECTION));
    upload.addEventListener('click', () => this.notify(EVENTS.UPLOAD_SONGS));
    refresh.addEventListener('click', () => this.notify(EVENTS.SYNC_LIBRARY));
    return h(
      'section',
      { class: 'welcome-card' },
      h('span', { class: 'eyebrow' }, 'Empecemos'),
      h('h2', { class: 'welcome-card__title' }, 'Tu música, a tu ritmo'),
      h(
        'p',
        { class: 'welcome-card__text' },
        readOnly
          ? 'Pulse reproduce las canciones de las carpetas que elijas, sin tocar tus archivos. Si acabas de añadir música, pulsa «Actualizar biblioteca».'
          : 'Tu música puede vivir en un bucket S3 (o compatible, como MinIO) o en carpetas de este equipo. Con un bucket, sube canciones con el botón o arrastrándolas a la ventana.',
      ),
      h('div', { class: 'welcome-card__actions' }, connect, upload, refresh),
    );
  }
}
