import { EVENTS } from '../events.js';
import { showArtistPictures } from '../actions.js';

/** Fotos de artista (Deezer) encontradas en segundo plano: Inicio y la colección abierta las muestran. */
export default {
  [EVENTS.ARTIST_PICTURES_CHANGED](ctx, pictures) {
    showArtistPictures(ctx, pictures);
  },
};
