import { EVENTS } from '../events.js';

/** Ecualizador (solo donde hay Web Audio usable): diálogo, preajustes, bandas y la salida de audio elegida. */
export default {
  async [EVENTS.APP_READY](ctx) {
    ctx.router.setEqualizerAvailable(ctx.equalizer.available());
    await ctx.equalizer.setOutputDevice(ctx.audio.outputDevice()).catch(() => {});
  },

  [EVENTS.OPEN_EQUALIZER](ctx) {
    if (ctx.equalizer.available()) ctx.equalizerDialog.open(ctx.equalizer.state());
  },

  [EVENTS.SET_EQUALIZER_PRESET](ctx, name) {
    ctx.equalizerDialog.show(ctx.equalizer.setPreset(name));
  },

  [EVENTS.SET_EQUALIZER_BAND](ctx, { index, gain }) {
    ctx.equalizerDialog.show(ctx.equalizer.setBand(index, gain));
  },

  // Con el ecualizador montado, el audio sale por su AudioContext: la salida elegida se le aplica a él.
  async [EVENTS.OUTPUT_DEVICE_CHANGE](ctx, deviceId) {
    await ctx.equalizer.setOutputDevice(deviceId).catch(() => {
      ctx.toast.show('No se pudo cambiar la salida del ecualizador', { tone: 'error' });
    });
  },
};
