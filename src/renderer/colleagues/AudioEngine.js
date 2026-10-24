import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

const STORAGE_KEYS = { volume: 'volume', muted: 'muted', outputDevice: 'outputDevice' };
const DEFAULT_VOLUME = 0.8;
const ERROR_MESSAGES = {
  1: 'Se canceló la carga del audio',
  2: 'Error al leer el archivo',
  3: 'No se pudo decodificar el audio',
  4: 'No se puede reproducir este formato de audio', // si el archivo falta, lo detecta handlers/errors.js
};

/**
 * Envuelve un HTMLAudioElement. Fuente de verdad del tiempo, el volumen y la salida.
 * Emite: time-update, state-change, track-started, ended, error.
 */
export class AudioEngine extends Colleague {
  #audio;
  #storage;
  #devices;
  #hasTrack = false;
  #awaitingStart = false;
  #consecutiveErrors = 0;

  constructor(audio, storage, devices = globalThis.navigator?.mediaDevices) {
    super();
    this.#audio = audio;
    this.#storage = storage;
    this.#devices = devices ?? null;
    audio.preload = 'auto';
    audio.volume = clamp(storage.get(STORAGE_KEYS.volume, DEFAULT_VOLUME));
    audio.muted = Boolean(storage.get(STORAGE_KEYS.muted, false));
    this.#listen();

    const savedDevice = storage.get(STORAGE_KEYS.outputDevice, '');
    if (savedDevice) this.setOutputDevice(savedDevice).catch(() => {}); // puede que ya no esté conectado
  }

  #listen() {
    const audio = this.#audio;
    audio.addEventListener('timeupdate', () => this.#emitTime());
    audio.addEventListener('durationchange', () => this.#emitTime());
    audio.addEventListener('play', () => this.notify(EVENTS.STATE_CHANGE, { playing: true }));
    audio.addEventListener('pause', () => this.notify(EVENTS.STATE_CHANGE, { playing: false }));
    audio.addEventListener('playing', () => {
      this.#consecutiveErrors = 0;
      if (!this.#awaitingStart) return;
      this.#awaitingStart = false;
      this.notify(EVENTS.TRACK_STARTED);
    });
    audio.addEventListener('ended', () => this.notify(EVENTS.ENDED));
    audio.addEventListener('error', () => {
      this.#consecutiveErrors += 1;
      this.#awaitingStart = false;
      this.notify(EVENTS.STATE_CHANGE, { playing: false });
      this.notify(EVENTS.ERROR, { message: ERROR_MESSAGES[audio.error?.code] ?? 'No se pudo reproducir la pista' });
    });
  }

  #emitTime() {
    const { currentTime, duration } = this.#audio;
    this.notify(EVENTS.TIME_UPDATE, { current: currentTime || 0, duration: Number.isFinite(duration) ? duration : 0 });
  }

  load(url, autoplay = true) {
    this.#audio.src = url;
    this.#hasTrack = true;
    this.#awaitingStart = true;
    if (autoplay) this.play();
  }

  play() {
    this.#audio.play()?.catch?.((error) => {
      // AbortError: se cargó otra pista antes de empezar. Los fallos reales llegan por 'error'.
      if (!['AbortError', 'NotSupportedError'].includes(error?.name)) console.warn('[AudioEngine] play()', error);
    });
  }

  pause() {
    this.#audio.pause();
  }

  /** Deja de reproducir y olvida la pista (p. ej. porque su archivo ya no existe). */
  stop() {
    this.#audio.pause();
    this.#audio.removeAttribute('src'); // vaciar src con '' provocaría un evento de error
    this.#audio.load();
    this.#hasTrack = false;
    this.#awaitingStart = false;
  }

  toggle() {
    if (this.#audio.paused) this.play();
    else this.pause();
  }

  isPlaying() {
    return !this.#audio.paused;
  }

  hasTrack() {
    return this.#hasTrack;
  }

  currentTime() {
    return this.#audio.currentTime || 0;
  }

  seek(seconds) {
    if (!this.#hasTrack || !Number.isFinite(seconds)) return;
    const { duration } = this.#audio;
    this.#audio.currentTime = clamp(seconds, 0, Number.isFinite(duration) ? duration : Infinity);
  }

  seekBy(delta) {
    this.seek(this.currentTime() + delta);
  }

  volume() {
    return this.#audio.volume;
  }

  setVolume(value) {
    const volume = clamp(value);
    this.#audio.volume = volume;
    this.#storage.set(STORAGE_KEYS.volume, volume);
    if (volume > 0 && this.#audio.muted) this.#setMuted(false);
    return volume;
  }

  stepVolume(delta) {
    return this.setVolume(Math.round((this.volume() + delta) * 100) / 100);
  }

  isMuted() {
    return this.#audio.muted;
  }

  toggleMute() {
    this.#setMuted(!this.#audio.muted);
    return this.#audio.muted;
  }

  #setMuted(muted) {
    this.#audio.muted = muted;
    this.#storage.set(STORAGE_KEYS.muted, muted);
  }

  /** Pistas seguidas que han fallado sin que ninguna llegara a sonar. */
  consecutiveErrors() {
    return this.#consecutiveErrors;
  }

  /** Salidas de audio, sin la virtual de "comunicaciones" de Windows (pensada para llamadas). */
  async outputDevices() {
    const devices = (await this.#devices?.enumerateDevices?.()) ?? [];
    return devices
      .filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'communications')
      .map((device) => ({ id: device.deviceId, label: device.label }));
  }

  /** Id del dispositivo actual ('' = predeterminado del sistema). */
  outputDevice() {
    return this.#audio.sinkId ?? '';
  }

  async setOutputDevice(deviceId) {
    if (typeof this.#audio.setSinkId !== 'function') throw new Error('Este sistema no permite elegir la salida de audio');
    await this.#audio.setSinkId(deviceId);
    this.#storage.set(STORAGE_KEYS.outputDevice, deviceId);
  }
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}
