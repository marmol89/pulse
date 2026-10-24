import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const FIELDS = [
  ['endpoint', 'Servidor', { type: 'url', placeholder: 'https://minio.ejemplo.com', autocomplete: 'url' }],
  ['accessKeyId', 'Clave de acceso', { autocomplete: 'username' }],
  ['secretAccessKey', 'Clave secreta', { type: 'password', autocomplete: 'current-password' }],
  ['bucket', 'Bucket', { placeholder: 'Si lo dejas vacío se usa el único que haya' }],
  ['prefix', 'Carpeta dentro del bucket (opcional)', { placeholder: 'p. ej. musica/' }],
];

/**
 * Formulario de conexión con el bucket S3 (diálogo modal). Solo pinta y emite: la conexión
 * la comprueba y la guarda el proceso main.
 * Emite: save-connection, import-credentials.
 */
export class ConnectionView extends Colleague {
  #dialog;
  #inputs = {};
  #error;
  #submit;
  #importButton;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    const fields = FIELDS.map(([name, label, attributes]) => {
      const input = h('input', { class: 'field__input', name, id: `connection-${name}`, spellcheck: 'false', ...attributes });
      this.#inputs[name] = input;
      return h('label', { class: 'field', for: input.id }, h('span', { class: 'field__label' }, label), input);
    });
    this.#error = h('p', { class: 'connection__error', role: 'alert', hidden: true });
    this.#importButton = h('button', { type: 'button', class: 'button button--secondary' }, icon('note'), 'Importar credentials.json');
    this.#importButton.addEventListener('click', () => this.notify(EVENTS.IMPORT_CREDENTIALS));
    const cancel = h('button', { type: 'button', class: 'link-button' }, 'Cancelar');
    cancel.addEventListener('click', () => this.close());
    this.#submit = h('button', { type: 'submit', class: 'button button--primary' }, 'Conectar');

    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog', novalidate: true },
      h('header', { class: 'connection__header' },
        h('h2', { class: 'connection__title', id: 'connection-title' }, 'Conecta tu música'),
        h('p', { class: 'connection__text' }, 'Pulse reproduce las canciones de tu bucket S3 (o compatible, como MinIO). Las claves se guardan cifradas en este equipo.'),
      ),
      this.#importButton,
      fields,
      this.#error,
      h('div', { class: 'connection__actions' }, cancel, this.#submit),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#error.hidden = true;
      this.notify(EVENTS.SAVE_CONNECTION, this.#values());
    });
    dialog.replaceChildren(form);
  }

  /** @param {{ endpoint, accessKeyId, bucket, prefix } | null} summary conexión guardada (sin clave secreta) */
  open(summary) {
    for (const input of Object.values(this.#inputs)) input.value = '';
    this.fill(summary ?? {});
    this.#inputs.secretAccessKey.placeholder = summary ? 'Guardada · déjala vacía para conservarla' : '';
    this.#error.hidden = true;
    if (!this.#dialog.open) this.#dialog.showModal();
    (Object.values(this.#inputs).find((input) => !input.value && input.name !== 'prefix') ?? this.#submit).focus();
  }

  /** Rellena los campos dados (la clave secreta nunca llega aquí desde el proceso main). */
  fill(fields) {
    for (const [name, value] of Object.entries(fields)) {
      if (this.#inputs[name] && typeof value === 'string') this.#inputs[name].value = value;
    }
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  showError(message) {
    this.#error.textContent = message;
    this.#error.hidden = false;
  }

  setBusy(busy) {
    this.#submit.disabled = busy;
    this.#importButton.disabled = busy;
    this.#submit.textContent = busy ? 'Conectando…' : 'Conectar';
  }

  close() {
    this.#inputs.secretAccessKey.value = ''; // que la clave no se quede en la página
    if (this.#dialog.open) this.#dialog.close();
  }

  #values() {
    return Object.fromEntries(Object.entries(this.#inputs).map(([name, input]) => [name, input.value.trim()]));
  }
}
