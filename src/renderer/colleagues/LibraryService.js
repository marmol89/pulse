import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

/**
 * Único colega que habla con el proceso main (window.api, expuesto por el preload).
 * Emite: tracks-updated (pistas completadas con datos de internet en segundo plano) y
 * library-changed (archivos que desaparecen del disco o vuelven con la app abierta).
 */
export class LibraryService extends Colleague {
  #api;

  constructor(api) {
    super();
    this.#api = api;
    api.onTracksUpdated?.((tracks) => this.notify(EVENTS.TRACKS_UPDATED, tracks));
    api.onLibraryChanged?.((change) => this.notify(EVENTS.LIBRARY_CHANGED, change));
  }

  /** ¿Sigue el archivo en el disco? Si no, el proceso main deja de mostrar la pista. */
  verify(path) {
    return this.#api.verifyTrack(path);
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

  /**
   * Busca en internet la carátula, los datos y la letra que falten (`force`: aunque ya se buscaran).
   * @returns {Promise<{ track: object, changed: boolean } | null>} rechaza si no hay conexión
   */
  lookup(path, { force = false } = {}) {
    return this.#api.lookupTrack(path, { force });
  }

  /** Activa o desactiva la búsqueda en segundo plano del proceso main. */
  setOnlineLookup(enabled) {
    return this.#api.setOnlineLookup(enabled);
  }
}
