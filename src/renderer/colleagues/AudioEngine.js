import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

const STORAGE_KEYS = { volume: 'volume', muted: 'muted', outputDevice: 'outputDevice', crossfade: 'crossfade' };
const DEFAULT_VOLUME = 0.8;
const PRELOAD_SECONDS = 20; // near-end: cuándo empezar a cargar la siguiente
const MAX_CROSSFADE_SECONDS = 8;
const FADE_STEP_MS = 50;
const ERROR_MESSAGES = {
  1: 'Se canceló la carga del audio',
  2: 'Error al leer el archivo',
  3: 'No se pudo decodificar el audio',
  4: 'No se puede reproducir este formato de audio', // si el archivo falta, lo detecta handlers/errors.js
};

/**
 * Envuelve los HTMLAudioElement. Fuente de verdad del tiempo, el volumen y la salida.
 * Con un segundo elemento (`standby`) no hay cortes entre pistas: a 20 s del final avisa con near-end,
 * `prepareNext(url)` carga ahí la siguiente y `load()` de esa URL solo cambia de elemento. Con fundido
 * (`setCrossfade`), ended llega esos segundos antes y las dos pistas se cruzan. Solo uno es "el reproductor":
 * los eventos del otro (que precarga o se está apagando) se ignoran.
 * Emite: time-update, state-change, track-started, near-end, ended, error.
 */
export class AudioEngine extends Colleague {
  #audio;
  #standby;
  #standbyUrl = null;
  #queuedNext = null; // la siguiente, a la espera de que el otro elemento termine de apagarse
  #storage;
  #devices;
  #timers;
  #volume;
  #gains = new Map(); // elemento → 0..1 (fundidos)
  #fades = new Map(); // elemento → intervalo del fundido en curso
  #crossfade;
  #hasTrack = false;
  #awaitingStart = false;
  #nearEndSent = false;
  #endedEarly = false;
  #consecutiveErrors = 0;

  constructor(audio, storage, devices = globalThis.navigator?.mediaDevices, { standby = null, timers = globalThis } = {}) {
    super();
    this.#audio = audio;
    this.#standby = standby;
    this.#storage = storage;
    this.#devices = devices ?? null;
    this.#timers = timers;
    this.#volume = clamp(storage.get(STORAGE_KEYS.volume, DEFAULT_VOLUME));
    this.#crossfade = standby ? clamp(storage.get(STORAGE_KEYS.crossfade, 0), 0, MAX_CROSSFADE_SECONDS) : 0;
    const muted = Boolean(storage.get(STORAGE_KEYS.muted, false));
    for (const element of this.#elements()) {
      element.preload = 'auto';
      element.muted = muted;
      this.#gains.set(element, 1);
      this.#applyVolume(element);
      this.#listen(element);
    }

    const savedDevice = storage.get(STORAGE_KEYS.outputDevice, '');
    if (savedDevice) this.setOutputDevice(savedDevice).catch(() => {}); // puede que ya no esté conectado
  }

  #elements() {
    return this.#standby ? [this.#audio, this.#standby] : [this.#audio];
  }

  #listen(element) {
    // Solo cuenta lo que pasa en el elemento activo.
    const on = (type, listener) => element.addEventListener(type, () => element === this.#audio && listener());
    on('timeupdate', () => this.#emitTime());
    on('durationchange', () => this.#emitTime());
    on('play', () => this.notify(EVENTS.STATE_CHANGE, { playing: true }));
    on('pause', () => this.notify(EVENTS.STATE_CHANGE, { playing: false }));
    on('playing', () => {
      this.#consecutiveErrors = 0;
      if (!this.#awaitingStart) return;
      this.#awaitingStart = false;
      this.notify(EVENTS.TRACK_STARTED);
    });
    on('ended', () => {
      if (!this.#endedEarly) this.notify(EVENTS.ENDED); // con fundido ya se avisó antes
    });
    on('error', () => {
      this.#consecutiveErrors += 1;
      this.#awaitingStart = false;
      this.notify(EVENTS.STATE_CHANGE, { playing: false });
      this.notify(EVENTS.ERROR, { message: ERROR_MESSAGES[element.error?.code] ?? 'No se pudo reproducir la pista' });
    });
  }

  #emitTime() {
    const { currentTime, duration } = this.#audio;
    const known = Number.isFinite(duration) && duration > 0;
    this.notify(EVENTS.TIME_UPDATE, { current: currentTime || 0, duration: known ? duration : 0 });
    if (!this.#standby || !known) return;
    const remaining = duration - (currentTime || 0);
    if (remaining > PRELOAD_SECONDS) this.#nearEndSent = false; // p. ej. al volver atrás
    else if (!this.#nearEndSent) {
      this.#nearEndSent = true;
      this.notify(EVENTS.NEAR_END);
    }
    // Con fundido, la siguiente empieza antes (solo en pistas lo bastante largas para que no se coma la canción).
    if (this.#crossfade > 0 && !this.#endedEarly && !this.#audio.paused && duration > this.#crossfade * 3 && remaining <= this.#crossfade) {
      this.#endedEarly = true;
      this.notify(EVENTS.ENDED);
    }
  }

  /** Empieza a cargar la pista que sonará después, sin reproducirla. */
  prepareNext(url) {
    if (!this.#standby || !url || url === this.#standbyUrl) return;
    if (this.#fades.has(this.#standby)) {
      this.#queuedNext = url; // aún se está apagando la anterior: no cortarla
      return;
    }
    this.#release(this.#standby);
    this.#standby.src = url;
    this.#standbyUrl = url;
  }

  load(url, autoplay = true) {
    const previous = this.#audio;
    const crossfading = this.#endedEarly && autoplay && !previous.paused;
    const preloaded = Boolean(this.#standby) && this.#standbyUrl === url && !this.#standby.error;
    const swap = Boolean(this.#standby) && (preloaded || crossfading);
    this.#standbyUrl = null;
    this.#queuedNext = null;
    this.#endedEarly = false;
    this.#nearEndSent = false;
    this.#hasTrack = true;
    this.#awaitingStart = true;
    if (swap) {
      this.#audio = this.#standby;
      this.#standby = previous;
      this.#stopFade(this.#audio);
      if (!preloaded) this.#audio.src = url;
      if (crossfading) this.#crossfadeFrom(previous);
      else this.#release(previous);
    } else {
      this.#release(this.#standby);
      this.#audio.src = url;
    }
    if (autoplay) this.play();
    // La precargada ya conoce su duración (no habrá durationchange): la barra no se queda con el tiempo de la anterior.
    if (swap) this.#emitTime();
  }

  /** La pista que termina baja mientras la nueva sube, durante los segundos del fundido. */
  #crossfadeFrom(previous) {
    this.#gains.set(this.#audio, 0);
    this.#applyVolume(this.#audio);
    this.#fade(this.#audio, 1);
    this.#fade(previous, 0, () => this.#releaseFaded(previous));
  }

  /** Terminó de apagarse: ya se puede precargar ahí la siguiente. */
  #releaseFaded(element) {
    this.#release(element);
    const next = this.#queuedNext;
    this.#queuedNext = null;
    if (next) this.prepareNext(next);
  }

  #fade(element, target, onDone = () => {}) {
    const start = this.#gains.get(element) ?? 1;
    const steps = Math.max(1, Math.round((this.#crossfade * 1000) / FADE_STEP_MS));
    let step = 0;
    const interval = this.#timers.setInterval(() => {
      step += 1;
      this.#gains.set(element, start + ((target - start) * step) / steps);
      this.#applyVolume(element);
      if (step < steps) return;
      this.#stopFade(element);
      onDone();
    }, FADE_STEP_MS);
    this.#fades.set(element, interval);
  }

  /** Corta el fundido de ese elemento y le devuelve el volumen normal. */
  #stopFade(element) {
    if (this.#fades.has(element)) {
      this.#timers.clearInterval(this.#fades.get(element));
      this.#fades.delete(element);
    }
    this.#gains.set(element, 1);
    this.#applyVolume(element);
  }

  /** Para y vacía un elemento que ya no suena. */
  #release(element) {
    if (!element) return;
    this.#stopFade(element);
    if (!element.paused) element.pause();
    if (!element.src) return;
    element.removeAttribute('src'); // vaciar src con '' provocaría un evento de error
    element.load();
  }

  #applyVolume(element) {
    element.volume = clamp(this.#volume * (this.#gains.get(element) ?? 1));
  }

  /** Segundos de fundido entre canciones (0: sin fundido). Sin segundo elemento no hay fundido. */
  crossfade() {
    return this.#crossfade;
  }

  setCrossfade(seconds) {
    this.#crossfade = this.#standby ? clamp(seconds, 0, MAX_CROSSFADE_SECONDS) : 0;
    this.#storage.set(STORAGE_KEYS.crossfade, this.#crossfade);
    return this.#crossfade;
  }

  play() {
    this.#audio.play()?.catch?.((error) => {
      // AbortError: se cargó otra pista antes de empezar. Los fallos reales llegan por 'error'.
      if (!['AbortError', 'NotSupportedError'].includes(error?.name)) console.warn('[AudioEngine] play()', error);
    });
  }

  pause() {
    this.#audio.pause();
    // La que se estaba apagando en un fundido no sigue sonando sola.
    for (const element of [...this.#fades.keys()]) if (element !== this.#audio) this.#releaseFaded(element);
  }

  /** Deja de reproducir y olvida la pista (p. ej. porque su archivo ya no existe). */
  stop() {
    this.#audio.pause();
    this.#audio.removeAttribute('src'); // vaciar src con '' provocaría un evento de error
    this.#audio.load();
    this.#release(this.#standby);
    this.#standbyUrl = null;
    this.#queuedNext = null;
    this.#hasTrack = false;
    this.#awaitingStart = false;
    this.#endedEarly = false;
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
    return this.#volume;
  }

  setVolume(value) {
    this.#volume = clamp(value);
    for (const element of this.#elements()) this.#applyVolume(element);
    this.#storage.set(STORAGE_KEYS.volume, this.#volume);
    if (this.#volume > 0 && this.#audio.muted) this.#setMuted(false);
    return this.#volume;
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
    for (const element of this.#elements()) element.muted = muted;
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

  /** Los dos elementos van a la misma salida (si no, la siguiente pista sonaría en otro sitio). */
  async setOutputDevice(deviceId) {
    if (typeof this.#audio.setSinkId !== 'function') throw new Error('Este sistema no permite elegir la salida de audio');
    await Promise.all(this.#elements().map((element) => element.setSinkId(deviceId)));
    this.#storage.set(STORAGE_KEYS.outputDevice, deviceId);
  }
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}
