import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

/**
 * Único colega que habla con el proceso main (window.api, expuesto por el preload).
 * La música vive en un bucket S3; la clave secreta nunca llega a la ventana.
 * Emite: tracks-updated (datos de internet en segundo plano), library-changed (cambios en el bucket)
 * y upload-progress (subida de canciones en curso).
 */
export class LibraryService extends Colleague {
  #api;

  constructor(api) {
    super();
    this.#api = api;
    api.onTracksUpdated?.((tracks) => this.notify(EVENTS.TRACKS_UPDATED, tracks));
    api.onLibraryChanged?.((change) => this.notify(EVENTS.LIBRARY_CHANGED, change));
    api.onUploadProgress?.((progress) => this.notify(EVENTS.UPLOAD_PROGRESS, progress));
  }

  /** Biblioteca guardada (la última sincronización con el bucket). */
  load() {
    return this.#api.loadLibrary();
  }

  /**
   * Sincroniza con el bucket. Los cambios llegan como library-changed.
   * @returns {Promise<{ added: number, removed: number }>} rechaza si no hay conexión
   */
  sync() {
    return this.#api.syncLibrary();
  }

  /** ¿Sigue la pista en el bucket? Si no, el proceso main la quita de la biblioteca. */
  verify(id) {
    return this.#api.verifyTrack(id);
  }

  /**
   * Elige canciones del ordenador y las sube al bucket (después llegan como library-changed).
   * @typedef {{ ok: true, total: number, uploaded: number, skipped: number, failed: Array<{ name: string, error: string }> }
   *   | { ok: false, error: string, needsConnection?: boolean }} UploadResult
   * @returns {Promise<UploadResult | null>} null si se cancela el diálogo
   */
  chooseAndUpload() {
    return this.#api.chooseUploads();
  }

  /**
   * Sube archivos o carpetas arrastrados a la ventana. Los que no vienen del disco se ignoran.
   * @param {File[]} files
   * @returns {Promise<UploadResult>}
   */
  uploadFiles(files) {
    const paths = files.map((file) => this.#api.pathForFile(file)).filter(Boolean);
    return this.#api.uploadPaths(paths);
  }

  /** Conexión guardada sin la clave secreta ({ endpoint, accessKeyId, bucket, prefix }) o null. */
  connection() {
    return this.#api.getConnection();
  }

  /** Comprueba y guarda la conexión. @returns {Promise<{ ok, summary?, count?, error? }>} */
  saveConnection(input) {
    return this.#api.saveConnection(input);
  }

  /** Elige un credentials.json y conecta con él. null si se cancela; si falta algo, { ok: false, error, fields }. */
  importCredentials() {
    return this.#api.importCredentials();
  }

  /**
   * Busca en internet la carátula, los datos y la letra que falten (`force`: aunque ya se buscaran).
   * @returns {Promise<{ track: object, changed: boolean } | null>} rechaza si no hay conexión
   */
  lookup(id, { force = false } = {}) {
    return this.#api.lookupTrack(id, { force });
  }

  /** Activa o desactiva la búsqueda en segundo plano del proceso main. */
  setOnlineLookup(enabled) {
    return this.#api.setOnlineLookup(enabled);
  }
}
