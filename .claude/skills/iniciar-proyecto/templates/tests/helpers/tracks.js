/** Crea una pista de prueba con valores por defecto razonables. */
export function track(path, fields = {}) {
  return {
    path,
    url: `media://track/${encodeURIComponent(path)}`,
    cover: null,
    title: path,
    artist: 'Artista',
    albumArtist: '',
    album: '',
    genre: '',
    trackNo: 0,
    disc: 0,
    year: 0,
    duration: 180,
    lyrics: '',
    ...fields,
  };
}

/** Lista de pistas a, b, c… */
export function tracks(...paths) {
  return paths.map((path) => track(path));
}
