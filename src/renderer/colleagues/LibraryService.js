import { Colleague } from '../core/Colleague.js';

/**
 * Único colega que habla con el proceso main (window.api, expuesto por el preload).
 * Servicio sin estado: no emite eventos.
 */
export class LibraryService extends Colleague {
  #api;

  constructor(api) {
    super();
    this.#api = api;
  }

  /** Biblioteca guardada en disco. */
  load() {
    return this.#api.loadLibrary();
  }

  /** Diálogo del sistema. Devuelve las rutas elegidas ([] si se cancela). */
  chooseFiles() {
    return this.#api.chooseFiles();
  }

  /** Diálogo del sistema. Devuelve la carpeta elegida o null. */
  chooseFolder() {
    return this.#api.chooseFolder();
  }

  /** Importa archivos/carpetas. Devuelve solo las pistas nuevas. */
  import(paths) {
    return this.#api.importPaths(paths);
  }

  /** Rutas reales de archivos arrastrados a la ventana. */
  pathsForFiles(files) {
    return [...files].map((file) => this.#api.pathForFile(file)).filter(Boolean);
  }
}
