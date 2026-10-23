import { EVENTS } from '../events.js';

/** Salida de audio ("Altavoz de la sala" en el diseño): listar y elegir dispositivo. */
export default {
  async [EVENTS.APP_READY](ctx) {
    await showCurrentDevice(ctx);
  },

  async [EVENTS.SHOW_OUTPUT_DEVICES](ctx) {
    ctx.nowPlaying.showOutputDevices(await ctx.audio.outputDevices(), ctx.audio.outputDevice());
  },

  async [EVENTS.OUTPUT_DEVICE_CHANGE](ctx, deviceId) {
    try {
      await ctx.audio.setOutputDevice(deviceId);
    } catch {
      ctx.toast.show('No se pudo cambiar la salida de audio', { tone: 'error' });
    }
    await showCurrentDevice(ctx);
  },
};

async function showCurrentDevice(ctx) {
  const devices = await ctx.audio.outputDevices();
  const current = ctx.audio.outputDevice() || 'default';
  ctx.nowPlaying.setOutputDevice(devices.find((device) => device.id === current) ?? null);
}
