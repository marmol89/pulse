import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';

const PRESETS = [
  ['flat', 'Plano'],
  ['bass', 'Graves'],
  ['vocal', 'Voces'],
  ['treble', 'Agudos'],
  ['acoustic', 'Acústico'],
  ['electronic', 'Electrónica'],
];

/**
 * Diálogo "Ecualizador": preajustes (chips) y cinco bandas (deslizadores verticales de −12 a +12 dB).
 * Solo pinta y emite. Emite: set-equalizer-preset, set-equalizer-band.
 */
export class EqualizerDialog extends Colleague {
  #dialog;
  #chips;
  #custom;
  #bands;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    this.#custom = h('span', { class: 'chip chip--static', hidden: true }, 'Personalizado');
    this.#chips = h(
      'div',
      { class: 'chips eq__presets', role: 'group', 'aria-label': 'Preajustes' },
      ...PRESETS.map(([name, label]) => h('button', { type: 'button', class: 'chip', 'data-preset': name, 'aria-pressed': 'false' }, label)),
      this.#custom,
    );
    this.#chips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-preset]');
      if (chip) this.notify(EVENTS.SET_EQUALIZER_PRESET, chip.dataset.preset);
    });
    this.#bands = h('div', { class: 'eq__bands' });
    const close = h('button', { type: 'submit', class: 'button button--primary' }, 'Cerrar');
    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog' },
      h(
        'header',
        { class: 'connection__header' },
        h('h2', { class: 'connection__title', id: 'equalizer-dialog-title' }, 'Ecualizador'),
        h('p', { class: 'connection__text' }, 'Ajusta graves, medios y agudos. Se aplica a todo lo que suena en este equipo.'),
      ),
      this.#chips,
      this.#bands,
      h('div', { class: 'connection__actions' }, close),
    );
    dialog.replaceChildren(form);
  }

  /** @param {{ preset: string, bands: { frequency: number, gain: number }[] }} state */
  open(state) {
    this.show(state);
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  show({ preset, bands }) {
    for (const chip of this.#chips.querySelectorAll('[data-preset]')) chip.setAttribute('aria-pressed', String(chip.dataset.preset === preset));
    this.#custom.hidden = preset !== 'custom';
    if (this.#bands.children.length !== bands.length) this.#bands.replaceChildren(...bands.map((band, index) => this.#band(band, index)));
    bands.forEach(({ gain }, index) => {
      const band = this.#bands.children[index];
      const input = band.querySelector('input');
      if (Number(input.value) !== gain) input.value = String(gain);
      band.querySelector('.eq__gain').textContent = formatGain(gain);
    });
  }

  isOpen() {
    return this.#dialog.open;
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }

  #band({ frequency }, index) {
    const label = formatFrequency(frequency);
    const input = h('input', { type: 'range', class: 'eq__range', min: '-12', max: '12', step: '1', value: '0', 'aria-label': `Banda de ${label}` });
    input.addEventListener('input', () => this.notify(EVENTS.SET_EQUALIZER_BAND, { index, gain: Number(input.value) }));
    return h('div', { class: 'eq__band' }, h('span', { class: 'eq__gain' }), input, h('span', { class: 'eq__frequency' }, label));
  }
}

function formatFrequency(hz) {
  return hz >= 1000 ? `${String(hz / 1000).replace('.', ',')} kHz` : `${hz} Hz`;
}

function formatGain(gain) {
  return gain > 0 ? `+${gain} dB` : `${gain} dB`;
}
