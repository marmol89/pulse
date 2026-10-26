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

const MODES = {
  s3: {
    tab: 'Bucket S3',
    text: 'Pulse reproduce las canciones de tu bucket S3 (o compatible, como MinIO). Las claves se guardan cifradas en este equipo.',
    submit: 'Conectar',
    busy: 'Conectando…',
  },
  local: {
    tab: 'Carpetas',
    text: 'Pulse reproduce las canciones de estas carpetas y nunca modifica tus archivos. Tus listas y favoritos se guardan solo en este equipo.',
    submit: 'Usar estas carpetas',
    busy: 'Leyendo las carpetas…',
  },
};

/** Nombre corto de una carpeta: "Música" de "C:\Users\ana\Música" (en Android ya viene así). */
const shortName = (folder) => folder.name.split(/[\\/]/).filter(Boolean).at(-1) ?? folder.name;

/**
 * Diálogo modal de "Conexión": de dónde sale la música, el bucket S3 o carpetas del equipo (nunca las dos a la
 * vez). Solo pinta y emite: lo comprueba y lo guarda el proceso main. Su estado es de UI: la pestaña que se ve
 * y las carpetas que se van añadiendo o quitando hasta pulsar "Usar estas carpetas".
 * Emite: save-connection, import-credentials, choose-folder, save-folders.
 */
export class ConnectionView extends Colleague {
  #dialog;
  #mode = 's3';
  #folders = [];
  #tabs = {};
  #panels = {};
  #inputs = {};
  #text;
  #folderList;
  #error;
  #submit;
  #busyButtons;

  constructor(dialog) {
    super();
    this.#dialog = dialog;
    const fields = FIELDS.map(([name, label, attributes]) => {
      const input = h('input', { class: 'field__input', name, id: `connection-${name}`, spellcheck: 'false', ...attributes });
      this.#inputs[name] = input;
      return h('label', { class: 'field', for: input.id }, h('span', { class: 'field__label' }, label), input);
    });
    const importButton = h('button', { type: 'button', class: 'button button--secondary' }, icon('note'), 'Importar credentials.json');
    importButton.addEventListener('click', () => this.notify(EVENTS.IMPORT_CREDENTIALS));
    const addFolder = h('button', { type: 'button', class: 'button button--secondary', id: 'connection-add-folder' }, icon('plus'), 'Añadir carpeta');
    addFolder.addEventListener('click', () => this.notify(EVENTS.CHOOSE_FOLDER));
    this.#folderList = h('div', { class: 'list-picker connection__folders', role: 'list', 'aria-label': 'Carpetas con música' });
    this.#folderList.addEventListener('click', (event) => {
      const id = event.target.closest('[data-remove]')?.dataset.remove;
      if (id === undefined) return;
      this.#folders = this.#folders.filter((folder) => folder.id !== id);
      this.#renderFolders();
      addFolder.focus();
    });
    this.#panels = {
      s3: h('div', { class: 'connection__panel', id: 'connection-panel-s3', role: 'tabpanel' }, importButton, fields),
      local: h('div', { class: 'connection__panel', id: 'connection-panel-local', role: 'tabpanel' }, this.#folderList, addFolder),
    };
    const tabs = h('div', { class: 'chips connection__tabs', role: 'tablist', 'aria-label': 'De dónde sale tu música' });
    for (const [mode, { tab }] of Object.entries(MODES)) {
      this.#tabs[mode] = h('button', { type: 'button', class: 'chip', role: 'tab', id: `connection-tab-${mode}`, 'aria-controls': `connection-panel-${mode}` }, tab);
      this.#tabs[mode].addEventListener('click', () => this.#show(mode));
      tabs.append(this.#tabs[mode]);
    }
    this.#text = h('p', { class: 'connection__text' });
    this.#error = h('p', { class: 'connection__error', role: 'alert', hidden: true });
    const cancel = h('button', { type: 'button', class: 'link-button' }, 'Cancelar');
    cancel.addEventListener('click', () => this.close());
    this.#submit = h('button', { type: 'submit', class: 'button button--primary' });
    this.#busyButtons = [this.#submit, importButton, addFolder];

    const form = h(
      'form',
      { class: 'connection__form', method: 'dialog', novalidate: true },
      h('header', { class: 'connection__header' }, h('h2', { class: 'connection__title', id: 'connection-title' }, 'Conecta tu música'), this.#text),
      tabs,
      this.#panels.s3,
      this.#panels.local,
      this.#error,
      h('div', { class: 'connection__actions' }, cancel, this.#submit),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#error.hidden = true;
      if (this.#mode === 'local') this.notify(EVENTS.SAVE_FOLDERS, this.#folders.map((folder) => folder.id));
      else this.notify(EVENTS.SAVE_CONNECTION, this.#values());
    });
    dialog.replaceChildren(form);
    this.#show('s3');
  }

  /** @param {{ mode, endpoint, accessKeyId, bucket, prefix, folders } | null} summary lo guardado (sin clave secreta) */
  open(summary) {
    for (const input of Object.values(this.#inputs)) input.value = '';
    this.fill(summary ?? {});
    this.#inputs.secretAccessKey.placeholder = summary?.bucket ? 'Guardada · déjala vacía para conservarla' : '';
    this.#folders = [...(summary?.folders ?? [])];
    this.#renderFolders();
    this.#error.hidden = true;
    this.#show(summary?.mode === 'local' ? 'local' : 's3');
    if (!this.#dialog.open) this.#dialog.showModal();
    if (this.#mode === 's3') (Object.values(this.#inputs).find((input) => !input.value && input.name !== 'prefix') ?? this.#submit).focus();
    else this.#tabs.local.focus();
  }

  /** Rellena los campos del bucket dados (la clave secreta nunca llega aquí desde el proceso main). */
  fill(fields) {
    for (const [name, value] of Object.entries(fields)) {
      if (this.#inputs[name] && typeof value === 'string') this.#inputs[name].value = value;
    }
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** Carpeta elegida en el selector del sistema ({ id, name }): se añade a la lista, sin repetir. */
  addFolder(folder) {
    if (!this.#folders.some((known) => known.id === folder.id)) this.#folders.push(folder);
    this.#error.hidden = true;
    this.#show('local');
    this.#renderFolders();
  }

  showError(message) {
    this.#error.textContent = message;
    this.#error.hidden = false;
  }

  setBusy(busy) {
    for (const button of this.#busyButtons) button.disabled = busy;
    this.#submit.textContent = busy ? MODES[this.#mode].busy : MODES[this.#mode].submit;
  }

  close() {
    this.#inputs.secretAccessKey.value = ''; // que la clave no se quede en la página
    if (this.#dialog.open) this.#dialog.close();
  }

  #show(mode) {
    this.#mode = mode;
    for (const [name, tab] of Object.entries(this.#tabs)) {
      tab.setAttribute('aria-selected', String(name === mode));
      tab.setAttribute('aria-pressed', String(name === mode)); // el estilo de los chips
      this.#panels[name].hidden = name !== mode;
    }
    this.#text.textContent = MODES[mode].text;
    this.#submit.textContent = MODES[mode].submit;
  }

  #renderFolders() {
    if (this.#folders.length === 0) {
      this.#folderList.replaceChildren(h('p', { class: 'connection__text' }, 'Aún no has añadido ninguna carpeta.'));
      return;
    }
    this.#folderList.replaceChildren(
      ...this.#folders.map((folder) =>
        h(
          'div',
          { class: 'list-picker__item trash-item', role: 'listitem', title: folder.name },
          icon('folder'),
          h(
            'span',
            { class: 'list-picker__name' },
            h('span', { class: 'ellipsis' }, shortName(folder)),
            folder.name !== shortName(folder) && h('span', { class: 'list-picker__count connection__folder-path ellipsis' }, folder.name),
          ),
          h('button', { type: 'button', class: 'link-button trash-item__restore', 'data-remove': folder.id, 'aria-label': `Quitar ${shortName(folder)}` }, 'Quitar'),
        ),
      ),
    );
  }

  #values() {
    return Object.fromEntries(Object.entries(this.#inputs).map(([name, input]) => [name, input.value.trim()]));
  }
}
