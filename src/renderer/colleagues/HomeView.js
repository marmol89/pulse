import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createCover, trackSeed } from '../ui/cover.js';
import { greeting, plural } from '../ui/format.js';
import { TrackList } from '../ui/trackList.js';

const FILTERS = [
  ['all', 'Todo'],
  ['albums', 'Álbumes'],
  ['artists', 'Artistas'],
  ['favorites', 'Favoritos'],
];
const RECENTS_LIMIT = 8;

/**
 * Pantalla 01 · Inicio: saludo, chips, "Mix diario", "Escuchado recientemente"
 * y géneros. El filtro de los chips es estado de la vista; los datos llegan en render().
 * Emite: play-mix, track-selected, open-collection, toggle-favorite, open-folder, open-files.
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
    });
    root.replaceChildren(h('header', { class: 'home-header' }, this.#greeting), chips, this.#content);
  }

  /** @param {{ isEmpty, recents, genres, albums, artists, favoriteTracks, favorites, currentPath, playing }} data */
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

  #setFilter(filter) {
    this.#filter = filter;
    for (const [name, chip] of this.#chips) chip.setAttribute('aria-pressed', String(name === filter));
    this.#renderContent();
  }

  #renderContent() {
    const data = this.#data;
    if (!data) return;
    if (data.isEmpty) {
      this.#content.replaceChildren(this.#welcome());
      return;
    }
    const sections = {
      all: () => [this.#mixCard(), this.#recentsSection(data.recents), this.#genreCards(data.genres)],
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
          cover: createCover({ src: artist.sample.cover, seed: artist.name, className: 'cover--card cover--round', tag: 'span' }),
          title: artist.name,
          subtitle: plural(artist.count, 'canción', 'canciones'),
          round: true,
          onClick: () => this.notify(EVENTS.OPEN_COLLECTION, { kind: 'artist', key: artist.key }),
        }),
      ),
    );
  }

  #favoritesList({ favoriteTracks, favorites, currentPath, playing }) {
    if (favoriteTracks.length === 0) {
      return h('p', { class: 'hint' }, 'Aún no tienes favoritos. Pulsa el corazón de cualquier canción para guardarla aquí.');
    }
    this.#favorites.render(favoriteTracks, { favorites, currentPath, playing });
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

  #welcome() {
    const folder = h('button', { type: 'button', class: 'button button--primary' }, icon('folder'), 'Añadir carpeta');
    const files = h('button', { type: 'button', class: 'button button--secondary' }, icon('note'), 'Añadir archivos');
    folder.addEventListener('click', () => this.notify(EVENTS.OPEN_FOLDER));
    files.addEventListener('click', () => this.notify(EVENTS.OPEN_FILES));
    return h(
      'section',
      { class: 'welcome-card' },
      h('span', { class: 'eyebrow' }, 'Empecemos'),
      h('h2', { class: 'welcome-card__title' }, 'Tu música, a tu ritmo'),
      h(
        'p',
        { class: 'welcome-card__text' },
        'Añade una carpeta con canciones para empezar. También puedes arrastrar archivos o carpetas a la ventana.',
      ),
      h('div', { class: 'welcome-card__actions' }, folder, files),
    );
  }
}
