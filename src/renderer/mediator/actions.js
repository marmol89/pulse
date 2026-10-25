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
  ctx.audio.load(track.url, autoplay);
  showTrack(ctx, track);
  eachTrackListView(ctx, (view) => view.highlight(track.path));
  return true;
}

/** Ya no suena nada: sin audio, sin Reproduciendo y con la player bar en "Nada sonando". */
export function clearPlayer(ctx) {
  ctx.audio.stop();
  ctx.router.closeOverlay();
  ctx.controls.clear();
  ctx.mediaSession.clear();
  eachTrackListView(ctx, (view) => view.highlight(null));
}

/** Tras quitar la pista actual: suena (o queda lista) la siguiente o, si no hay, se vacía el reproductor. */
export function playCurrentOrClear(ctx, autoplay) {
  const track = ctx.playlist.current();
  if (track) loadTrack(ctx, track, autoplay);
  else clearPlayer(ctx);
}

/** La pista actual en la player bar, Reproduciendo y los controles del sistema. */
export function showTrack(ctx, track) {
  const isFavorite = ctx.favorites.has(track.path);
  ctx.controls.show(track, isFavorite);
  ctx.nowPlaying.show(track, isFavorite);
  ctx.mediaSession.show(track);
}

/** El corazón de una pista en la player bar, Reproduciendo y todas las listas. */
export function showFavorite(ctx, path, isFavorite) {
  ctx.controls.setFavorite(path, isFavorite);
  ctx.nowPlaying.setFavorite(path, isFavorite);
  eachTrackListView(ctx, (view) => view.setFavorite(path, isFavorite));
}

/** Favoritos recibidos (del bucket o de otro equipo): los corazones que cambian e Inicio. */
export function applyFavorites(ctx, paths) {
  for (const path of ctx.favorites.set(paths)) showFavorite(ctx, path, ctx.favorites.has(path));
  refreshHome(ctx);
}

/** Pistas cuyo archivo ya no existe: fuera de la biblioteca, la cola y las vistas. Devuelve si sonaba una. */
export function removeTracks(ctx, paths) {
  if (paths.length === 0) return false;
  ctx.catalog.remove(paths);
  const currentRemoved = ctx.playlist.remove(paths);
  eachTrackListView(ctx, (view) => view.removeTracks(paths));
  refreshHome(ctx);
  return currentRemoved;
}

/** Pistas completadas con datos de internet: modelos y vistas pasan a mostrarlas. */
export function applyTrackUpdates(ctx, tracks) {
  if (tracks.length === 0) return;
  ctx.catalog.add(tracks);
  const currentPath = ctx.playlist.current()?.path;
  for (const track of tracks) {
    ctx.playlist.replace(track);
    eachTrackListView(ctx, (view) => view.updateTrack(track, ctx.favorites.has(track.path)));
    if (track.path === currentPath) showTrack(ctx, track);
  }
  refreshHome(ctx);
}

/** Colecciones que combinan varios modelos (también las listas del usuario); el resto las resuelve Catalog. */
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
    case 'list': {
      const list = ctx.lists.get(source.id);
      return { source, title: list?.name ?? 'Lista eliminada', byline: 'Tu lista · en tu bucket', tracks: list ? ctx.catalog.byPaths(list.tracks) : [] };
    }
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

/** Elemento de la sidebar que se resalta con cada colección. */
function navFor(source) {
  if (source.kind === 'library') return 'library';
  return source.kind === 'list' ? `list:${source.id}` : null;
}

export function openCollection(ctx, source) {
  renderCollection(ctx, source);
  ctx.router.closeOverlay();
  ctx.router.show('collection', navFor(source));
}

/** Inicio y, si está abierta, la colección visible reflejan la biblioteca actual. */
export function refreshLibraryViews(ctx) {
  refreshHome(ctx);
  const source = ctx.playlistView.source();
  if (source) renderCollection(ctx, source);
}

export function refreshHome(ctx) {
  ctx.home.render({
    isEmpty: ctx.catalog.size() === 0,
    recents: ctx.catalog.byPaths(ctx.recents.list()),
    genres: ctx.catalog.topGenres(4),
    albums: ctx.catalog.albums(),
    artists: ctx.catalog.artists(),
    favoriteTracks: ctx.catalog.byPaths(ctx.favorites.list()),
    lists: ctx.lists.all().map((list) => {
      const tracks = ctx.catalog.byPaths(list.tracks);
      return { id: list.id, name: list.name, count: tracks.length, sample: tracks.find((track) => track.cover) ?? tracks[0] ?? null };
    }),
    ...trackListState(ctx),
  });
}

/** Listas nuevas (propias o de otro equipo): modelo, sidebar, Inicio y la lista abierta, si es una. */
export function applyLists(ctx, lists) {
  ctx.lists.set(lists);
  ctx.router.setLists(ctx.lists.all());
  refreshHome(ctx);
  const source = ctx.playlistView.source();
  if (source?.kind !== 'list') return;
  if (ctx.lists.get(source.id)) renderCollection(ctx, source);
  else if (ctx.router.current() === 'collection') ctx.router.back(); // la han eliminado
}

export function showModes(ctx) {
  const modes = { shuffle: ctx.playlist.isShuffle(), repeat: ctx.playlist.repeatMode() };
  ctx.controls.setModes(modes);
  ctx.nowPlaying.setModes(modes);
  ctx.playlistView.setModes(modes);
}
