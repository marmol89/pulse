import { EVENTS } from '../events.js';
import { loadTrack, playCurrentOrClear, removeTracks, sourcePlace } from '../actions.js';

/**
 * Errores de reproducción. Si la canción ya no está en el bucket (o en su carpeta), se quita de la
 * biblioteca y sigue la siguiente; si es otro fallo, se avisa y se salta.
 */
export default {
  async [EVENTS.ERROR](ctx, error) {
    const track = ctx.playlist.current();
    if (track && !(await isAvailable(ctx, track.path))) {
      ctx.toast.show(`«${track.title}» ya no está ${sourcePlace(ctx)}: se ha quitado de la biblioteca`, { tone: 'error' });
      if (removeTracks(ctx, [track.path])) playCurrentOrClear(ctx, true);
      return;
    }
    // Mientras se comprobaba la canción el usuario pudo elegir otra pista: no saltarla.
    if (ctx.playlist.current()?.path !== track?.path) return;
    ctx.toast.show(error?.message ?? 'No se pudo reproducir la pista', { tone: 'error' });
    // Si ya fallaron tantas pistas seguidas como hay en la cola, parar en vez de girar en bucle.
    if (ctx.audio.consecutiveErrors() >= ctx.playlist.size()) return;
    loadTrack(ctx, ctx.playlist.next());
  },
};

/** Ante la duda (el proceso main no responde) no se quita nada. */
async function isAvailable(ctx, path) {
  try {
    return await ctx.library.verify(path);
  } catch {
    return true;
  }
}
