import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

const COMMANDS = { toggle: EVENTS.PLAY_TOGGLE, next: EVENTS.NEXT, previous: EVENTS.PREVIOUS };

/**
 * Bandeja del sistema y botones de la barra de tareas (solo escritorio: `window.api.desktop`; en Android no existe
 * y no hace nada). Como vista: cuenta al sistema lo que suena. Como emisor: reenvía sus órdenes.
 * Emite: play-toggle, next, previous.
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

  /** Mini-reproductor: el main cambia el tamaño de la ventana (la interfaz la cambia el Router). */
  setMini(enabled) {
    this.#desktop?.setMini?.(Boolean(enabled));
  }
}
