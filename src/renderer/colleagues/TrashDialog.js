import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { formatBytes } from '../ui/format.js';

/**
 * Diálogo de la papelera del bucket: confirmar "Eliminar del bucket" de una canción, y ver lo eliminado
 * para restaurarlo o vaciar la papelera (con una segunda pulsación: eso ya no se puede deshacer).
 * Solo pinta y emite; su estado es de UI (modo, canción a eliminar y la confirmación de vaciar).
 * Emite: confirm-trash, restore-from-trash, empty-trash.
 */
export class TrashDialog extends Colleague {
  #dialog;
  #title;
  #text;
  #items;
  #error;
  #empty;
  #submit;
  #cancel;
  #path = null;
  #confirmingEmpty = false;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    this.#title = h('h2', { class: 'connection__title', id: 'trash-dialog-title' });
    this.#text = h('p', { class: 'connection__text' });
    this.#items = h('div', { class: 'list-picker trash-items', role: 'list', 'aria-label': 'Canciones en la papelera' });
    this.#items.addEventListener('click', (event) => {
      const button = event.target.closest('[data-key]');
      if (!button) return;
      button.disabled = true;
      this.notify(EVENTS.RESTORE_FROM_TRASH, button.dataset.key);
    });
    this.#error = h('p', { class: 'connection__error', role: 'alert', hidden: true });
    this.#empty = h('button', { type: 'button', class: 'link-button list-dialog__delete' });
    this.#empty.addEventListener('click', () => this.#onEmpty());
    this.#cancel = h('button', { type: 'button', class: 'link-button' });
    this.#cancel.addEventListener('click', () => this.close());
    this.#submit = h('button', { type: 'submit', class: 'button button--primary' }, 'Mover a la papelera');

    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog', novalidate: true },
      h('header', { class: 'connection__header' }, this.#title, this.#text),
      this.#items,
      this.#error,
      h('div', { class: 'connection__actions' }, this.#empty, this.#cancel, this.#submit),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#error.hidden = true;
      this.#submit.disabled = true;
      this.notify(EVENTS.CONFIRM_TRASH, this.#path);
    });
    dialog.replaceChildren(form);
  }

  /** "Eliminar del bucket": confirma antes de mover la canción a la papelera. */
  openConfirm(track) {
    this.#path = track.path;
    this.#open('Eliminar del bucket', `«${track.title}» de ${track.artist} irá a la papelera de tu bucket y desaparecerá de todos tus Pulse. Podrás restaurarla desde «Papelera» en Tu música.`);
    this.#items.hidden = true;
    this.#empty.hidden = true;
    this.#submit.hidden = false;
    this.#cancel.textContent = 'Cancelar';
    this.#submit.disabled = false;
    this.#submit.focus();
  }

  /** La papelera; `items` null mientras se carga. */
  openTrash(items = null) {
    this.#path = null;
    this.#open('Papelera', 'Canciones eliminadas de tu bucket. Restaura las que quieras; al vaciar la papelera se borran para siempre.');
    this.#submit.hidden = true;
    this.#cancel.textContent = 'Cerrar';
    this.showItems(items);
  }

  /** @param {{ key: string, name: string, size: number }[] | null} items */
  showItems(items) {
    this.#items.hidden = false;
    this.#setConfirmingEmpty(false);
    this.#empty.hidden = !items?.length;
    if (items === null) return this.#items.replaceChildren(h('p', { class: 'connection__text' }, 'Cargando…'));
    if (items.length === 0) return this.#items.replaceChildren(h('p', { class: 'connection__text' }, 'La papelera está vacía.'));
    this.#items.replaceChildren(
      ...items.map((item) =>
        h(
          'div',
          { class: 'list-picker__item trash-item', role: 'listitem', title: item.name },
          icon('note'),
          h('span', { class: 'list-picker__name ellipsis' }, item.name),
          h('span', { class: 'list-picker__count' }, formatBytes(item.size)),
          h('button', { type: 'button', class: 'link-button trash-item__restore', 'data-key': item.key }, 'Restaurar'),
        ),
      ),
    );
  }

  showError(message) {
    this.#error.textContent = message;
    this.#error.hidden = false;
    this.#submit.disabled = false;
    for (const button of this.#items.querySelectorAll('[data-key]')) button.disabled = false;
  }

  isOpen() {
    return this.#dialog.open;
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }

  #open(title, text) {
    this.#title.textContent = title;
    this.#text.textContent = text;
    this.#error.hidden = true;
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** Vaciar pide una segunda pulsación: borra para siempre, en todos los equipos. */
  #onEmpty() {
    if (this.#confirmingEmpty) this.notify(EVENTS.EMPTY_TRASH);
    else this.#setConfirmingEmpty(true);
  }

  #setConfirmingEmpty(confirming) {
    this.#confirmingEmpty = confirming;
    this.#empty.textContent = confirming ? 'Pulsa otra vez para borrarlas para siempre' : 'Vaciar papelera';
    this.#empty.classList.toggle('is-confirming', confirming);
  }
}
