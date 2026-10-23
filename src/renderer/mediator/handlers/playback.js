import { EVENTS } from '../events.js';
import { eachTrackListView, loadTrack, playCollection } from '../actions.js';

/** Reproducción: play/pausa, posición, volumen y sincronización de la UI con el audio. */
export default {
  [EVENTS.APP_READY](ctx) {
    showVolume(ctx);
  },

  [EVENTS.PLAY_TOGGLE](ctx) {
    if (ctx.audio.hasTrack()) ctx.audio.toggle();
    else if (ctx.playlist.current()) loadTrack(ctx, ctx.playlist.current());
    else if (ctx.catalog.size() > 0) playCollection(ctx, { kind: 'library' });
  },

  [EVENTS.SEEK](ctx, seconds) {
    ctx.audio.seek(seconds);
  },

  [EVENTS.SEEK_STEP](ctx, delta) {
    ctx.audio.seekBy(delta);
  },

  [EVENTS.VOLUME_CHANGE](ctx, volume) {
    ctx.audio.setVolume(volume);
    showVolume(ctx);
  },

  [EVENTS.VOLUME_STEP](ctx, delta) {
    ctx.audio.stepVolume(delta);
    showVolume(ctx);
  },

  [EVENTS.TOGGLE_MUTE](ctx) {
    ctx.audio.toggleMute();
    showVolume(ctx);
  },

  [EVENTS.TIME_UPDATE](ctx, { current, duration }) {
    ctx.controls.setProgress(current, duration);
    ctx.nowPlaying.setProgress(current, duration);
    ctx.mediaSession.setPosition(current, duration);
  },

  [EVENTS.STATE_CHANGE](ctx, { playing }) {
    ctx.controls.setPlaying(playing);
    ctx.nowPlaying.setPlaying(playing);
    ctx.mediaSession.setPlaying(playing);
    eachTrackListView(ctx, (view) => view.setPlaying(playing));
  },
};

function showVolume(ctx) {
  ctx.controls.setVolume(ctx.audio.volume(), ctx.audio.isMuted());
}
