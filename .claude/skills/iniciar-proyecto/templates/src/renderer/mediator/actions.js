/**
 * Acciones compartidas entre módulos de handlers, para no duplicar coordinación.
 */
export function loadTrack(ctx, track, autoplay = true) {
  if (!track) return false;
  ctx.audio.load(track.url, autoplay);
  ctx.nowPlaying.show(track, ctx.favorites.has(track.path));
  ctx.playlistView.highlight(ctx.playlist.index());
  return true;
}

/** Vuelve a pintar la vista de Inicio con los datos actuales. */
export function refreshHome(ctx) {
  ctx.home.render({
    recents: ctx.recents.list(),
    genres: ctx.playlist.topGenres(4),
  });
}
