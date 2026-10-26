import { Colleague } from '../core/Colleague.js';

const STORAGE_KEY = 'equalizer';
export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000];
const MAX_GAIN = 12;
const MID_Q = 1;
export const EQ_PRESETS = Object.freeze({
  flat: { label: 'Plano', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Graves', gains: [6, 4, 0, 0, 0] },
  vocal: { label: 'Voces', gains: [-2, 0, 4, 3, 0] },
  treble: { label: 'Agudos', gains: [0, 0, 0, 3, 6] },
  acoustic: { label: 'Acústico', gains: [3, 1, 0, 2, 3] },
  electronic: { label: 'Electrónica', gains: [5, 2, -1, 2, 4] },
});
export const CUSTOM_PRESET = 'custom';

/**
 * Ecualizador de cinco bandas sobre los dos <audio> de AudioEngine (los da app.js), con Web Audio.
 * La cadena (elementos → filtros → preamplificador → salida) se monta **solo la primera vez que deja de estar
 * plano**: hasta entonces el audio suena como siempre. Una vez montada, la salida de audio la decide el
 * AudioContext (`setOutputDevice`), no los elementos. Sin Web Audio usable (Android), `available()` es falso.
 * El preamplificador baja lo que suba la banda más alta, para que no sature. Modelo y servicio: no emite eventos.
 */
export class Equalizer extends Colleague {
  #elements;
  #storage;
  #createContext;
  #available;
  #preset;
  #gains;
  #context = null;
  #filters = [];
  #preamp = null;
  #sinkId = '';

  constructor(elements, storage, { createContext = () => new globalThis.AudioContext(), available = true } = {}) {
    super();
    this.#elements = elements;
    this.#storage = storage;
    this.#createContext = createContext;
    this.#available = Boolean(available);
    const saved = storage.get(STORAGE_KEY, null);
    this.#preset = saved?.preset in EQ_PRESETS || saved?.preset === CUSTOM_PRESET ? saved.preset : 'flat';
    this.#gains = normalizeGains(saved?.gains ?? EQ_PRESETS[this.#preset]?.gains);
    if (this.#available && !isFlat(this.#gains)) this.#apply();
  }

  available() {
    return this.#available;
  }

  /** { preset, gains, bands: [{ frequency, gain }] } */
  state() {
    return {
      preset: this.#preset,
      gains: [...this.#gains],
      bands: EQ_FREQUENCIES.map((frequency, index) => ({ frequency, gain: this.#gains[index] })),
    };
  }

  setPreset(name) {
    if (!(name in EQ_PRESETS)) return this.state();
    this.#preset = name;
    this.#gains = [...EQ_PRESETS[name].gains];
    return this.#save();
  }

  /** Mueve una banda: el ajuste pasa a ser "Personalizado" (salvo que coincida con un preajuste). */
  setBand(index, gain) {
    if (!Number.isInteger(index) || index < 0 || index >= EQ_FREQUENCIES.length) return this.state();
    this.#gains[index] = clampGain(gain);
    this.#preset = Object.keys(EQ_PRESETS).find((name) => sameGains(EQ_PRESETS[name].gains, this.#gains)) ?? CUSTOM_PRESET;
    return this.#save();
  }

  /** Salida elegida ('' = la del sistema). Solo cuenta con la cadena montada; si no, la usan los elementos. */
  async setOutputDevice(deviceId) {
    this.#sinkId = deviceId ?? '';
    await this.#applySink();
  }

  /** ¿Pasa el audio por el ecualizador? (una vez montada la cadena, siempre). */
  isActive() {
    return this.#context !== null;
  }

  #save() {
    this.#storage.set(STORAGE_KEY, { preset: this.#preset, gains: this.#gains });
    if (this.#available && (this.#context || !isFlat(this.#gains))) this.#apply();
    return this.state();
  }

  #apply() {
    if (!this.#context) this.#build();
    this.#gains.forEach((gain, index) => {
      this.#filters[index].gain.value = gain;
    });
    this.#preamp.gain.value = 10 ** (-Math.max(0, ...this.#gains) / 20);
    if (this.#context.state === 'suspended') this.#context.resume?.().catch(() => {});
  }

  #build() {
    const context = this.#createContext();
    this.#filters = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequency;
      if (filter.type === 'peaking') filter.Q.value = MID_Q;
      return filter;
    });
    this.#preamp = context.createGain();
    for (let index = 0; index < this.#filters.length - 1; index += 1) this.#filters[index].connect(this.#filters[index + 1]);
    this.#filters.at(-1).connect(this.#preamp);
    this.#preamp.connect(context.destination);
    for (const element of this.#elements) context.createMediaElementSource(element).connect(this.#filters[0]);
    this.#context = context;
    this.#applySink().catch(() => {});
  }

  async #applySink() {
    if (!this.#context || typeof this.#context.setSinkId !== 'function') return;
    await this.#context.setSinkId(this.#sinkId === 'default' ? '' : this.#sinkId);
  }
}

function clampGain(value) {
  return Math.round(Math.min(MAX_GAIN, Math.max(-MAX_GAIN, Number(value) || 0)));
}

function normalizeGains(gains) {
  return EQ_FREQUENCIES.map((_, index) => clampGain(Array.isArray(gains) ? gains[index] : 0));
}

function isFlat(gains) {
  return gains.every((gain) => gain === 0);
}

function sameGains(a, b) {
  return a.every((gain, index) => gain === b[index]);
}
