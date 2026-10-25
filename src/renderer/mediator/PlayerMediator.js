import { Mediator } from '../core/Mediator.js';
import playback from './handlers/playback.js';
import output from './handlers/output.js';
import navigation from './handlers/navigation.js';
import modes from './handlers/modes.js';
import library from './handlers/library.js';
import views from './handlers/views.js';
import favorites from './handlers/favorites.js';
import recents from './handlers/recents.js';
import online from './handlers/online.js';
import changes from './handlers/changes.js';
import connection from './handlers/connection.js';
import uploads from './handlers/uploads.js';
import errors from './handlers/errors.js';
import lists from './handlers/lists.js';
import listTracks from './handlers/listTracks.js';
import librarySort from './handlers/librarySort.js';

/**
 * Solo compone: conecta colegas y registra módulos de handlers.
 * No añadas lógica aquí; crea o amplía un módulo en ./handlers/.
 */
export class PlayerMediator extends Mediator {
  #context;

  /**
   * @param {{
   *   audio, playlist, catalog, favorites, recents, lists, settings, library, mediaSession,
   *   router, home, search, playlistView, nowPlaying, controls, toast, connection, listDialog, keyboard?
   * }} colleagues
   */
  constructor(colleagues) {
    super();
    this.#context = Object.freeze({ ...colleagues });
    for (const colleague of Object.values(colleagues)) colleague.setMediator(this);

    this.use(playback)
      .use(output)
      .use(navigation)
      .use(modes)
      .use(library)
      .use(views)
      .use(favorites)
      .use(recents)
      .use(online)
      .use(changes)
      .use(connection)
      .use(uploads)
      .use(errors)
      .use(lists)
      .use(listTracks)
      .use(librarySort);
  }

  get context() {
    return this.#context;
  }
}
