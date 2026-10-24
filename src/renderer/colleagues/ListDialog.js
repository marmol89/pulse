import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { plural } from '../ui/format.js';

const MODES = {
  pick: { title: 'Añadir a una lista', text: 'Elige una de tus listas o crea una nueva.', label: 'O crea una lista nueva', submit: 'Crear y añadir' },
  create: { title: 'Nueva lista', text: 'Se guarda en tu bucket y la verás en todos tus Pulse.', label: 'Nombre de la lista', submit: 'Crear' },
  edit: { title: 'Editar lista', text: 'Los cambios llegan a todos tus Pulse conectados a este bucket.', label: 'Nombre de la lista', submit: 'Guardar' },
};

/**
 * Diálogo de las listas: elegir a cuál va una canción (o crear una con ella), crear una vacía,
 * o renombrar y eliminar una. Solo pinta y emite; su estado es de UI (modo, canciones elegidas y la
 * confirmación de eliminar).
 * Emite: add-to-list, create-list, rename-list, delete-list.
 */
export class ListDialog extends Colleague {
  #dialog;
  #title;
  #text;
  #picker;
  #label;
  #name;
  #error;
  #delete;
  #submit;
  #mode = 'create';
  #paths = [];
  #listId = null;
  #confirming = false;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    this.#title = h('h2', { class: 'connection__title', id: 'list-dialog-title' });
    this.#text = h('p', { class: 'connection__text' });
    this.#picker = h('div', { class: 'list-picker', role: 'group', 'aria-label': 'Tus listas' });
    this.#picker.addEventListener('click', (event) => {
      const item = event.target.closest('[data-list]');
      if (item) this.notify(EVENTS.ADD_TO_LIST, { id: item.dataset.list, paths: this.#paths });
    });
    this.#name = h('input', { class: 'field__input', id: 'list-dialog-name', maxlength: '100', autocomplete: 'off', spellcheck: 'false' });
    this.#label = h('span', { class: 'field__label' });
    this.#error = h('p', { class: 'connection__error', role: 'alert', hidden: true });
    this.#delete = h('button', { type: 'button', class: 'link-button list-dialog__delete' });
    this.#delete.addEventListener('click', () => this.#onDelete());
    const cancel = h('button', { type: 'button', class: 'link-button' }, 'Cancelar');
    cancel.addEventListener('click', () => this.close());
    this.#submit = h('button', { type: 'submit', class: 'button button--primary' });

    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog', novalidate: true },
      h('header', { class: 'connection__header' }, this.#title, this.#text),
      this.#picker,
      h('label', { class: 'field', for: this.#name.id }, this.#label, this.#name),
      this.#error,
      h('div', { class: 'connection__actions' }, this.#delete, cancel, this.#submit),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#error.hidden = true;
      const name = this.#name.value;
      if (this.#mode === 'edit') this.notify(EVENTS.RENAME_LIST, { id: this.#listId, name });
      else this.notify(EVENTS.CREATE_LIST, { name, paths: this.#paths });
    });
    dialog.replaceChildren(form);
  }

  /** "Añadir a una lista": las listas del usuario y, debajo, crear una nueva con esas canciones. */
  openPicker(lists, paths) {
    this.#open('pick', { paths });
    this.#picker.replaceChildren(
      ...lists.map((list) =>
        h(
          'button',
          { type: 'button', class: 'list-picker__item', 'data-list': list.id, title: list.name },
          icon('playlist'),
          h('span', { class: 'list-picker__name ellipsis' }, list.name),
          h('span', { class: 'list-picker__count' }, plural(list.tracks.length, 'canción', 'canciones')),
        ),
      ),
    );
    this.#picker.hidden = lists.length === 0;
    (this.#picker.querySelector('button') ?? this.#name).focus();
  }

  openCreate(paths = []) {
    this.#open('create', { paths });
    this.#name.focus();
  }

  /** @param {{ id, name }} list */
  openEdit(list) {
    this.#open('edit', { listId: list.id, name: list.name });
    this.#name.select();
  }

  showError(message) {
    this.#error.textContent = message;
    this.#error.hidden = false;
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }

  #open(mode, { paths = [], listId = null, name = '' }) {
    const texts = MODES[mode];
    this.#mode = mode;
    this.#paths = paths;
    this.#listId = listId;
    this.#title.textContent = texts.title;
    this.#text.textContent = texts.text;
    this.#label.textContent = texts.label;
    this.#submit.textContent = texts.submit;
    this.#name.value = name;
    this.#name.placeholder = mode === 'edit' ? '' : 'p. ej. Para correr';
    this.#picker.hidden = true;
    this.#error.hidden = true;
    this.#setConfirming(false);
    this.#delete.hidden = mode !== 'edit';
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** Eliminar pide una segunda pulsación: es para todos los equipos y no se puede deshacer. */
  #onDelete() {
    if (this.#confirming) this.notify(EVENTS.DELETE_LIST, this.#listId);
    else this.#setConfirming(true);
  }

  #setConfirming(confirming) {
    this.#confirming = confirming;
    this.#delete.textContent = confirming ? 'Pulsa otra vez para eliminarla' : 'Eliminar lista';
    this.#delete.classList.toggle('is-confirming', confirming);
  }
}
