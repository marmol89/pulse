/**
 * Acciones compartidas entre módulos de handlers, para no duplicar coordinación.
 * Igual que los handlers: sin estado, solo reciben el contexto (ctx) con los colegas.
 */

/** Vistas que pintan listas de pistas y comparten interfaz: highlight, setPlaying, setFavorite. */
const TRACK_LIST_VIEWS = ['playlistView', 'search', 'home'];

export function eachTrackListView(ctx, fn) {
  for (const name of TRACK_LIST_VIEWS) fn(ctx[name]);
}

/** Estado que necesita cualquier lista de pistas para pintarse. */
export function trackListState(ctx) {
  return {
    favorites: new Set(ctx.favorites.list()),
    currentPath: ctx.playlist.current()?.path ?? null,
    playing: ctx.audio.isPlaying(),
  };
}

export function loadTrack(ctx, track, autoplay = true) {
  if (!track) return false;
  const isFavorite = ctx.favorites.has(track.path);
  ctx.audio.load(track.url, autoplay);
  ctx.controls.show(track, isFavorite);
  ctx.nowPlaying.show(track, isFavorite);
  ctx.mediaSession.show(track);
  eachTrackListView(ctx, (view) => view.highlight(track.path));
  return true;
}

/** Colecciones que combinan varios modelos; el resto las resuelve Catalog. */
export function resolveCollection(ctx, source) {
  switch (source.kind) {
    case 'queue':
      return { source, title: 'Cola de reproducción', byline: 'Reproduciendo ahora', tracks: ctx.playlist.tracks() };
    case 'favorites':
      return { source, title: 'Tus favoritos', byline: 'Creado por ti', tracks: ctx.catalog.byPaths(ctx.favorites.list()) };
    case 'recents':
      return { source, title: 'Escuchado recientemente', byline: 'Creado por ti', tracks: ctx.catalog.byPaths(ctx.recents.list()) };
    case 'mix':
      return { source, title: 'Mix diario', byline: 'Para ti', tracks: ctx.catalog.all() };
    default:
      return ctx.catalog.collection(source);
  }
}

/** Convierte una colección en la cola y empieza a sonar (por `startPath` si se indica). */
export function playCollection(ctx, source, startPath = null) {
  const collection = resolveCollection(ctx, source);
  const track = ctx.playlist.setQueue(collection.tracks, startPath);
  if (track) ctx.nowPlaying.setContext(collection.title);
  return loadTrack(ctx, track);
}

export function renderCollection(ctx, source) {
  ctx.playlistView.render(resolveCollection(ctx, source), trackListState(ctx));
}

export function openCollection(ctx, source) {
  renderCollection(ctx, source);
  ctx.router.closeOverlay();
  ctx.router.show('collection', source.kind === 'library' ? 'library' : null);
}

export function refreshHome(ctx) {
  ctx.home.render({
    isEmpty: ctx.catalog.size() === 0,
    recents: ctx.catalog.byPaths(ctx.recents.list()),
    genres: ctx.catalog.topGenres(4),
    albums: ctx.catalog.albums(),
    artists: ctx.catalog.artists(),
    favoriteTracks: ctx.catalog.byPaths(ctx.favorites.list()),
    ...trackListState(ctx),
  });
}

export function showModes(ctx) {
  const modes = { shuffle: ctx.playlist.isShuffle(), repeat: ctx.playlist.repeatMode() };
  ctx.controls.setModes(modes);
  ctx.nowPlaying.setModes(modes);
  ctx.playlistView.setModes(modes);
}
