import { EVENTS } from '../events.js';
import { refreshHome } from '../actions.js';

function addTracks(ctx, tracks) {
  if (!tracks.length) return;
  ctx.playlist.add(tracks);
  ctx.playlistView.render(ctx.playlist.tracks(), ctx.playlist.index());
  refreshHome(ctx);
}

/** Biblioteca: incorporar pistas desde archivos o carpetas. */
export default {
  async [EVENTS.OPEN_FILES](ctx) {
    addTracks(ctx, await ctx.library.pickFiles());
  },

  async [EVENTS.OPEN_FOLDER](ctx) {
    addTracks(ctx, await ctx.library.pickFolder());
  },
};
