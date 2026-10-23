import { Colleague } from '../core/Colleague.js';

const DURATION_MS = 3500;

/** Aviso breve sobre la player bar ("12 canciones añadidas", errores…). No emite eventos. */
export class ToastView extends Colleague {
  #element;
  #timer = 0;

  constructor(element) {
    super();
    this.#element = element;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
  }

  /** @param {string} message @param {{ tone?: 'info'|'error', sticky?: boolean }} [options] */
  show(message, { tone = 'info', sticky = false } = {}) {
    clearTimeout(this.#timer);
    this.#element.textContent = message;
    this.#element.dataset.tone = tone;
    this.#element.classList.add('is-visible');
    if (!sticky) this.#timer = setTimeout(() => this.hide(), DURATION_MS);
  }

  hide() {
    this.#element.classList.remove('is-visible');
  }
}
