import { EVENTS } from '../events.js';

const LABELS = {
  off: 'Volumen uniforme desactivado',
  track: 'Volumen uniforme por canción',
  album: 'Volumen uniforme por disco',
};

/** Volumen uniforme: la ganancia ReplayGain de cada pista la aplica AudioEngine al cargarla (actions.loadTrack). */
export default {
  [EVENTS.APP_READY](ctx) {
    ctx.router.setLoudness(ctx.audio.loudness());
  },

  [EVENTS.SET_LOUDNESS](ctx, mode) {
    const applied = ctx.audio.setLoudness(mode);
    ctx.router.setLoudness(applied);
    ctx.toast.show(LABELS[applied]);
  },

  // La que suena se releyó (p. ej. la primera vez que se lee su ReplayGain): se aplica ya, sin esperar a la siguiente.
  [EVENTS.TRACKS_UPDATED](ctx, tracks) {
    const current = ctx.playlist.current();
    const updated = current && tracks.find((track) => track.path === current.path);
    if (updated && ctx.audio.hasTrack()) ctx.audio.setReplayGain(updated.replayGain ?? null);
  },
};
