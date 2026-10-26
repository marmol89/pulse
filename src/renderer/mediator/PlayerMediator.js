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
import folders from './handlers/folders.js';
import uploads from './handlers/uploads.js';
import errors from './handlers/errors.js';
import lists from './handlers/lists.js';
import listTracks from './handlers/listTracks.js';
import artistPictures from './handlers/artistPictures.js';
import queue from './handlers/queue.js';
import resume from './handlers/resume.js';
import sleep from './handlers/sleep.js';
import librarySort from './handlers/librarySort.js';
import crossfade from './handlers/crossfade.js';
import downloads from './handlers/downloads.js';
import trash from './handlers/trash.js';
import loudness from './handlers/loudness.js';
import equalizer from './handlers/equalizer.js';
import plays from './handlers/plays.js';
import desktop from './handlers/desktop.js';

/**
 * Solo compone: conecta colegas y registra módulos de handlers.
 * No añadas lógica aquí; crea o amplía un módulo en ./handlers/.
 */
export class PlayerMediator extends Mediator {
  #context;

  /**
   * @param {{
   *   audio, equalizer, playlist, catalog, favorites, recents, plays, lists, settings, session, library, mediaSession, desktop, sleepTimer,
   *   router, home, search, playlistView, nowPlaying, controls, toast, connection, listDialog, trashDialog, equalizerDialog, keyboard?
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
      .use(folders)
      .use(uploads)
      .use(errors)
      .use(lists)
      .use(listTracks)
      .use(artistPictures)
      .use(queue)
      .use(resume)
      .use(sleep)
      .use(librarySort)
      .use(crossfade)
      .use(downloads)
      .use(trash)
      .use(loudness)
      .use(equalizer)
      .use(plays)
      .use(desktop);
  }

  get context() {
    return this.#context;
  }
}
