import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

const POSITION_INTERVAL_MS = 1000;

/**
 * Integra la app con los controles multimedia del sistema (teclas multimedia,
 * panel de Windows, MPRIS en Linux) mediante la Media Session API.
 * Como vista: muestra la pista actual al sistema. Como emisor: reenvía sus acciones.
 */
export class MediaSessionBridge extends Colleague {
  #session;
  #Metadata;
  #fetch;
  #playing = false;
  #lastPositionAt = Number.NEGATIVE_INFINITY;
  #showCount = 0;
  #artworkUrl = null;

  constructor(session = globalThis.navigator?.mediaSession, Metadata = globalThis.MediaMetadata, fetchFn = globalThis.fetch) {
    super();
    this.#session = session ?? null;
    this.#Metadata = Metadata ?? null;
    this.#fetch = fetchFn;
    if (!this.#session) return;

    const actions = {
      play: () => {
        if (!this.#playing) this.notify(EVENTS.PLAY_TOGGLE);
      },
      pause: () => {
        if (this.#playing) this.notify(EVENTS.PLAY_TOGGLE);
      },
      previoustrack: () => this.notify(EVENTS.PREVIOUS),
      nexttrack: () => this.notify(EVENTS.NEXT),
      seekto: ({ seekTime }) => this.notify(EVENTS.SEEK, seekTime),
    };
    for (const [action, handler] of Object.entries(actions)) {
      try {
        this.#session.setActionHandler(action, handler);
      } catch {
        // Acción no admitida por este sistema.
      }
    }
  }

  /** Publica la pista al momento y añade la carátula cuando se ha descargado. */
  async show(track) {
    if (!this.#session || !this.#Metadata) return;
    const showId = ++this.#showCount;
    const metadata = { title: track.title, artist: track.artist, album: track.album };
    this.#session.metadata = new this.#Metadata({ ...metadata, artwork: [] });
    if (!track.cover) return;
    const artwork = await this.#toBlobUrl(track.cover);
    // Si mientras tanto empezó otra pista, esta carátula ya no vale.
    if (artwork && showId === this.#showCount) this.#session.metadata = new this.#Metadata({ ...metadata, artwork: [{ src: artwork }] });
  }

  /** Ya no suena nada: el sistema deja de mostrar la pista (y se descarta una carátula pendiente). */
  clear() {
    this.#showCount += 1;
    this.#playing = false;
    if (!this.#session) return;
    this.#session.metadata = null;
    this.#session.playbackState = 'none';
  }

  setPlaying(playing) {
    this.#playing = playing;
    if (this.#session) this.#session.playbackState = playing ? 'playing' : 'paused';
  }

  /** El sistema solo acepta carátulas http(s), data o blob: se convierte la URL media://. */
  async #toBlobUrl(src) {
    try {
      const response = await this.#fetch(src);
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      if (this.#artworkUrl) URL.revokeObjectURL(this.#artworkUrl);
      this.#artworkUrl = url;
      return url;
    } catch {
      return null;
    }
  }

  /** Posición para la barra de tiempo del sistema, como mucho una vez por segundo. */
  setPosition(current, duration, now = Date.now()) {
    if (typeof this.#session?.setPositionState !== 'function' || !(duration > 0)) return;
    if (now - this.#lastPositionAt < POSITION_INTERVAL_MS) return;
    this.#lastPositionAt = now;
    try {
      this.#session.setPositionState({ duration, position: Math.min(Math.max(current, 0), duration), playbackRate: 1 });
    } catch {
      // Estado de posición no válido para el sistema: se ignora.
    }
  }
}
