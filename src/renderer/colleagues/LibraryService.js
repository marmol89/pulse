import { Colleague } from '../core/Colleague.js';
import { EVENTS } from '../mediator/events.js';

/**
 * Único colega que habla con el proceso main (window.api, expuesto por el preload).
 * La música vive en un bucket S3; la clave secreta nunca llega a la ventana.
 * Emite: tracks-updated (datos de internet en segundo plano), library-changed (cambios en el bucket),
 * upload-progress (subida de canciones en curso), lists-changed, favorites-changed y recents-changed (cambiados desde otro equipo).
 */
export class LibraryService extends Colleague {
  #api;

  constructor(api) {
    super();
    this.#api = api;
    api.onTracksUpdated?.((tracks) => this.notify(EVENTS.TRACKS_UPDATED, tracks));
    api.onLibraryChanged?.((change) => this.notify(EVENTS.LIBRARY_CHANGED, change));
    api.onUploadProgress?.((progress) => this.notify(EVENTS.UPLOAD_PROGRESS, progress));
    api.onListsChanged?.((lists) => this.notify(EVENTS.LISTS_CHANGED, lists));
    api.onFavoritesChanged?.((paths) => this.notify(EVENTS.FAVORITES_CHANGED, paths));
    api.onRecentsChanged?.((paths) => this.notify(EVENTS.RECENTS_CHANGED, paths));
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
   * @returns {Promise<{ track: object, changed: boolean, unavailable?: true } | null>} `unavailable`: sin conexión
   *   o con un servicio caído un momento (se reintentará)
   */
  lookup(id, { force = false } = {}) {
    return this.#api.lookupTrack(id, { force });
  }

  /**
   * Listas de canciones (guardadas en el bucket, compartidas con los demás equipos).
   * Las operaciones devuelven { ok: true, lists, id? } o { ok: false, error } con el motivo en español.
   * @typedef {{ ok: true, lists: object[], id?: string } | { ok: false, error: string }} ListResult
   */
  lists() {
    return this.#api.getLists();
  }

  /** @returns {Promise<ListResult>} con el `id` de la nueva */
  createList(name, paths = []) {
    return this.#api.createList(name, paths);
  }

  /** @returns {Promise<ListResult>} */
  renameList(id, name) {
    return this.#api.renameList(id, name);
  }

  /** Añade al final las que no estén ya. @returns {Promise<ListResult>} */
  addToList(id, paths) {
    return this.#api.addToList(id, paths);
  }

  /** @returns {Promise<ListResult>} */
  removeFromList(id, path) {
    return this.#api.removeFromList(id, path);
  }

  /** @returns {Promise<ListResult>} */
  deleteList(id) {
    return this.#api.deleteList(id);
  }

  /**
   * Favoritos (guardados en el bucket, compartidos con los demás equipos): rutas, las más recientes primero.
   * @typedef {{ ok: true, favorites: string[] } | { ok: false, error: string }} FavoriteResult
   */
  favorites() {
    return this.#api.getFavorites();
  }

  /** Marca (`favorite`) o desmarca. @returns {Promise<FavoriteResult>} */
  setFavorite(path, favorite) {
    return this.#api.setFavorite(path, favorite);
  }

  /** Sube los favoritos que solo estaban en este equipo (de la más antigua a la más reciente). @returns {Promise<FavoriteResult>} */
  importFavorites(paths) {
    return this.#api.importFavorites(paths);
  }

  /**
   * "Escuchado recientemente" (en el bucket, compartido con los demás equipos): rutas, la última que sonó primero.
   * @typedef {{ ok: true, recents: string[] } | { ok: false, error: string }} RecentResult
   */
  recents() {
    return this.#api.getRecents();
  }

  /** Ha empezado a sonar. @returns {Promise<RecentResult>} */
  addRecent(path) {
    return this.#api.addRecent(path);
  }

  /** Sube los recientes que solo estaban en este equipo (de la más antigua a la más reciente). @returns {Promise<RecentResult>} */
  importRecents(paths) {
    return this.#api.importRecents(paths);
  }

  /** Activa o desactiva la búsqueda en segundo plano del proceso main. */
  setOnlineLookup(enabled) {
    return this.#api.setOnlineLookup(enabled);
  }
}
