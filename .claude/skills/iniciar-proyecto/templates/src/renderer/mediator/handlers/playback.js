import { EVENTS } from '../events.js';
import { loadTrack } from '../actions.js';

/** Reproducción: play/pausa, posición, volumen, salida y sincronización de la UI con el audio. */
export default {
  [EVENTS.PLAY_TOGGLE](ctx) {
    if (ctx.audio.hasTrack()) ctx.audio.toggle();
    else loadTrack(ctx, ctx.playlist.current());
  },

  [EVENTS.SEEK](ctx, seconds) {
    ctx.audio.seek(seconds);
  },

  [EVENTS.VOLUME_CHANGE](ctx, volume) {
    ctx.audio.setVolume(volume);
  },

  async [EVENTS.OUTPUT_DEVICE_CHANGE](ctx, deviceId) {
    await ctx.audio.setOutputDevice(deviceId);
    ctx.nowPlaying.setOutputDevice(deviceId);
  },

  [EVENTS.TIME_UPDATE](ctx, { current, duration }) {
    ctx.controls.setProgress(current, duration);
    ctx.nowPlaying.setTime(current, duration);
  },

  [EVENTS.STATE_CHANGE](ctx, { playing }) {
    ctx.controls.setPlaying(playing);
    ctx.nowPlaying.setPlaying(playing);
    ctx.playlistView.setPlaying(playing);
  },
};
