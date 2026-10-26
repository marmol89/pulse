import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';

const TEXT_FIELDS = [
  ['title', 'Título'],
  ['artist', 'Artista'],
  ['album', 'Álbum'],
  ['albumArtist', 'Artista del álbum'],
  ['genre', 'Género'],
];
const NUMBER_FIELDS = [
  ['year', 'Año', 9999],
  ['trackNo', 'Pista', 999],
  ['disc', 'Disco', 99],
];

/**
 * "Editar datos" de una canción: título, artista, álbum, género, año, pista y disco. Lo cambiado gana a las etiquetas
 * del archivo y a los datos de internet (y con un bucket llega a los demás Pulse); "Restaurar datos del archivo"
 * lo quita. Solo pinta y emite; su estado es de UI (la pista abierta).
 * Emite: save-track-edits, restore-track-data.
 */
export class TrackEditDialog extends Colleague {
  #dialog;
  #inputs = new Map();
  #error;
  #restore;
  #path = null;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    const field = (name, label, attributes) => {
      const input = h('input', { class: 'field__input', id: `track-edit-${name}`, name, autocomplete: 'off', ...attributes });
      this.#inputs.set(name, input);
      return h('label', { class: 'field', for: input.id }, h('span', { class: 'field__label' }, label), input);
    };
    this.#error = h('p', { class: 'connection__error', role: 'alert', hidden: true });
    this.#restore = h('button', { type: 'button', class: 'link-button track-edit__restore', hidden: true }, 'Restaurar datos del archivo');
    this.#restore.addEventListener('click', () => this.notify(EVENTS.RESTORE_TRACK_DATA, this.#path));
    const cancel = h('button', { type: 'button', class: 'link-button' }, 'Cancelar');
    cancel.addEventListener('click', () => this.close());

    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog', novalidate: true },
      h(
        'header',
        { class: 'connection__header' },
        h('h2', { class: 'connection__title', id: 'track-edit-heading' }, 'Editar datos'),
        h('p', { class: 'connection__text' }, 'Solo cambia lo que ve Pulse: el archivo no se toca. Con un bucket, llega a todos tus Pulse.'),
      ),
      ...TEXT_FIELDS.map(([name, label]) => field(name, label, { maxlength: '200', spellcheck: 'false' })),
      h('div', { class: 'track-edit__numbers' }, ...NUMBER_FIELDS.map(([name, label, max]) => field(name, label, { type: 'number', min: '0', max: String(max), step: '1', inputmode: 'numeric' }))),
      this.#error,
      h('div', { class: 'connection__actions' }, this.#restore, cancel, h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar')),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#error.hidden = true;
      const changes = Object.fromEntries([...this.#inputs].map(([name, input]) => [name, input.type === 'number' ? Number(input.value || 0) : input.value]));
      this.notify(EVENTS.SAVE_TRACK_EDITS, { path: this.#path, changes });
    });
    dialog.replaceChildren(form);
  }

  /** @param {Track & { edited?: boolean }} track */
  open(track) {
    this.#path = track.path;
    for (const [name, input] of this.#inputs) {
      const value = track[name];
      input.value = input.type === 'number' ? (value > 0 ? String(value) : '') : (value ?? '');
    }
    this.#restore.hidden = !track.edited;
    this.#error.hidden = true;
    if (!this.#dialog.open) this.#dialog.showModal();
    this.#inputs.get('title').select();
  }

  showError(message) {
    this.#error.textContent = message;
    this.#error.hidden = false;
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }
}
