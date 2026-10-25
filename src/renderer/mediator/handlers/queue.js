import { EVENTS } from '../events.js';
import { loadTrack, playCurrentOrClear, renderCollection } from '../actions.js';

/** Cola editable: "Reproducir a continuación", "Añadir a la cola" y mover o quitar en "Ver la cola". El orden vive en Playlist. */
export default {
  [EVENTS.PLAY_NEXT](ctx, paths) {
    addToQueue(ctx, paths, 'playNext', 'Sonará a continuación');
  },

  [EVENTS.ENQUEUE](ctx, paths) {
    addToQueue(ctx, paths, 'enqueue', 'Añadida a la cola');
  },

  [EVENTS.MOVE_IN_QUEUE](ctx, { path, to }) {
    if (ctx.playlist.move(path, to)) refreshQueueView(ctx);
  },

  [EVENTS.REMOVE_FROM_QUEUE](ctx, path) {
    const wasPlaying = ctx.audio.isPlaying();
    if (ctx.playlist.remove([path])) playCurrentOrClear(ctx, wasPlaying);
    refreshQueueView(ctx);
  },
};

function addToQueue(ctx, paths, method, message) {
  const wasEmpty = !ctx.playlist.current();
  const added = ctx.playlist[method](ctx.catalog.byPaths(paths));
  if (added === 0) return;
  // Sin nada sonando, lo añadido empieza a sonar.
  if (wasEmpty) {
    ctx.nowPlaying.setContext('Cola de reproducción');
    loadTrack(ctx, ctx.playlist.current());
  }
  refreshQueueView(ctx);
  ctx.toast.show(added === 1 ? message : `${added} canciones: ${message.toLowerCase()}`);
}

function refreshQueueView(ctx) {
  const source = ctx.playlistView.source();
  if (source?.kind === 'queue') renderCollection(ctx, source);
}
