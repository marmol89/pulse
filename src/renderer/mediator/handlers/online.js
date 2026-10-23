import { EVENTS } from '../events.js';
import { applyTrackUpdates } from '../actions.js';

/**
 * Datos de internet (carátula, álbum, año, género, letra). Busca el proceso main a través
 * de LibraryService; aquí solo se decide cuándo y se reparte el resultado entre las vistas.
 */
export default {
  [EVENTS.APP_READY](ctx) {
    showOnlineLookup(ctx);
  },

  [EVENTS.SET_ONLINE_LOOKUP](ctx, enabled) {
    ctx.settings.setOnlineLookup(enabled);
    showOnlineLookup(ctx);
    ctx.toast.show(enabled ? 'Se completarán carátulas e información desde internet' : 'Búsqueda en internet desactivada');
  },

  // La pista que empieza a sonar se completa al momento, letra incluida.
  async [EVENTS.TRACK_STARTED](ctx) {
    const track = ctx.playlist.current();
    if (!track || !ctx.settings.onlineLookup()) return;
    try {
      const result = await ctx.library.lookup(track.path);
      if (result?.changed) applyTrackUpdates(ctx, [result.track]);
    } catch {
      // Sin conexión: la cola del proceso main lo reintentará más tarde.
    }
  },

  // "Buscar en internet" en Reproduciendo: aunque ya se buscara y aunque esté desactivada la búsqueda automática.
  async [EVENTS.LOOKUP_TRACK](ctx, path) {
    ctx.nowPlaying.setLookupState('loading');
    try {
      const result = await ctx.library.lookup(path, { force: true });
      if (result?.changed) applyTrackUpdates(ctx, [result.track]);
      const found = result?.track.online?.status === 'found';
      ctx.toast.show(found ? 'Información actualizada desde internet' : 'No se encontró esta canción en internet');
    } catch {
      ctx.toast.show('No se pudo conectar. Inténtalo más tarde', { tone: 'error' });
    } finally {
      ctx.nowPlaying.setLookupState('idle');
    }
  },

  [EVENTS.TRACKS_UPDATED](ctx, tracks) {
    applyTrackUpdates(ctx, tracks);
  },
};

function showOnlineLookup(ctx) {
  const enabled = ctx.settings.onlineLookup();
  ctx.library.setOnlineLookup(enabled);
  ctx.router.setOnlineLookup(enabled);
}
