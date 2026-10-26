import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

const COMMANDS = { toggle: EVENTS.PLAY_TOGGLE, next: EVENTS.NEXT, previous: EVENTS.PREVIOUS };

/**
 * Bandeja del sistema, botones de la barra de tareas y actualizaciones (solo escritorio: `window.api.desktop`; en
 * Android no existe y no hace nada). Como vista: cuenta al sistema lo que suena. Como emisor: reenvía sus órdenes y
 * el estado de la actualización.
 * Emite: play-toggle, next, previous, update-status.
 */
export class DesktopBridge extends Colleague {
  #desktop;
  #last = '';

  constructor(desktop = null) {
    super();
    this.#desktop = desktop ?? null;
    this.#desktop?.onCommand?.((command) => {
      if (COMMANDS[command]) this.notify(COMMANDS[command]);
    });
    this.#desktop?.onUpdateStatus?.((status) => this.notify(EVENTS.UPDATE_STATUS, status));
  }

  available() {
    return this.#desktop !== null;
  }

  /** @param {{ track: Track | null, playing: boolean }} now */
  show({ track, playing }) {
    const state = { title: track?.title ?? '', artist: track?.artist ?? '', playing: Boolean(track) && playing, hasTrack: Boolean(track) };
    const key = JSON.stringify(state);
    if (!this.#desktop || key === this.#last) return;
    this.#last = key;
    this.#desktop.update(state);
  }

  setCloseToTray(enabled) {
    this.#desktop?.setCloseToTray(Boolean(enabled));
  }

  /** @returns {Promise<{ state: 'unavailable' | 'idle' | 'ready', version: string | null }>} */
  async updateStatus() {
    return (await this.#desktop?.updateStatus?.()) ?? { state: 'unavailable', version: null };
  }

  /** "Reiniciar ahora": el main cierra Pulse, instala la versión descargada y la abre de nuevo. */
  installUpdate() {
    this.#desktop?.installUpdate?.();
  }

  /** Mini-reproductor: el main cambia el tamaño de la ventana (la interfaz la cambia el Router). */
  setMini(enabled) {
    this.#desktop?.setMini?.(Boolean(enabled));
  }
}
