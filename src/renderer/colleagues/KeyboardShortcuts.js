import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

/**
 * Atajos de teclado. Emite los mismos eventos que los controles: no hay lógica duplicada.
 * `repeat`: se repite al mantener la tecla; `inText`: también funciona escribiendo en un campo.
 */
export const SHORTCUTS = [
  { key: ' ', event: EVENTS.PLAY_TOGGLE },
  { key: 'ArrowRight', ctrl: true, event: EVENTS.NEXT },
  { key: 'ArrowLeft', ctrl: true, event: EVENTS.PREVIOUS },
  { key: 'ArrowRight', event: EVENTS.SEEK_STEP, payload: 5, repeat: true },
  { key: 'ArrowLeft', event: EVENTS.SEEK_STEP, payload: -5, repeat: true },
  { key: 'ArrowUp', ctrl: true, event: EVENTS.VOLUME_STEP, payload: 0.05, repeat: true },
  { key: 'ArrowDown', ctrl: true, event: EVENTS.VOLUME_STEP, payload: -0.05, repeat: true },
  { key: 'm', event: EVENTS.TOGGLE_MUTE },
  { key: 'm', ctrl: true, event: EVENTS.TOGGLE_MINI_PLAYER },
  { key: 's', event: EVENTS.TOGGLE_SHUFFLE },
  { key: 'r', event: EVENTS.CYCLE_REPEAT },
  { key: 'l', event: EVENTS.TOGGLE_FAVORITE },
  { key: 'f', ctrl: true, event: EVENTS.NAVIGATE, payload: 'search', inText: true },
  { key: 'Escape', event: EVENTS.CLOSE_NOW_PLAYING, inText: true },
];

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset']);

export class KeyboardShortcuts extends Colleague {
  constructor(target = globalThis.window) {
    super();
    target.addEventListener('keydown', (event) => this.#handle(event));
  }

  #handle(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey) return;
    const ctrl = Boolean(event.ctrlKey || event.metaKey);
    const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
    const shortcut = SHORTCUTS.find((candidate) => candidate.key === key && Boolean(candidate.ctrl) === ctrl);
    if (!shortcut) return;
    // En un diálogo (conexión, listas, editar datos…) las teclas son suyas: Esc lo cierra.
    if (event.target?.closest?.('dialog[open]')) return;
    if (isTextField(event.target) && !shortcut.inText) return;
    // En un deslizador, las flechas mueven el propio deslizador.
    if (isRange(event.target) && key.startsWith('Arrow') && !ctrl) return;
    // En un interruptor o casilla, Espacio la marca (Enter no lo hace).
    if (key === ' ' && isToggle(event.target)) return;
    event.preventDefault();
    if (event.repeat && !shortcut.repeat) return;
    this.notify(shortcut.event, shortcut.payload);
  }
}

function isTextField(target) {
  if (!target) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && !NON_TEXT_INPUTS.has(target.type);
}

function isRange(target) {
  return target?.tagName === 'INPUT' && target.type === 'range';
}

function isToggle(target) {
  return target?.tagName === 'INPUT' && (target.type === 'checkbox' || target.type === 'radio');
}
