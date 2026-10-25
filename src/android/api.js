import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLibraryStore } from '../backend/library/store.js';
import { AUDIO_EXTENSIONS, isAudioFile, toTrack } from '../backend/library/tracks.js';
import { parseTrackId, readRemoteCover } from '../backend/library/remote.js';
import { createLibrarySync } from '../backend/library/sync.js';
import { createUploader } from '../backend/library/upload.js';
import { createMetadataStore } from '../backend/library/metadata.js';
import { createListStore, listResult } from '../backend/library/lists.js';
import { createFavoriteStore, favoriteResult } from '../backend/library/favorites.js';
import { createConnectionStore } from '../backend/s3/connection.js';
import { createS3Service } from '../backend/s3/service.js';
import { createS3Storage } from '../backend/s3/storage.js';
import { createHttp } from '../backend/online/http.js';
import { createEnricher } from '../backend/online/enricher.js';
import { createEnrichmentQueue } from '../backend/online/queue.js';
import { createNativeFetch, createS3RequestHandler } from './nativeHttp.js';
import { createCoverCache } from './covers.js';
import { pickFiles } from './picker.js';

/** Lo máximo que permite una URL firmada de S3: se vuelve a firmar cada vez que llega a la interfaz. */
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
const AUDIO_ACCEPT = ['audio/*', ...AUDIO_EXTENSIONS.map((extension) => `.${extension}`)].join(',');
/** toTrack sin URLs: present() pone las de Android (firmada para el audio, archivo local para la carátula). */
const NO_URLS = { track: () => '', cover: () => '' };

/** URL firmada para que el <audio> pida el objeto (y sus rangos) directamente a S3. */
export function presignUrl(storage, key, seconds = SIGNED_URL_SECONDS) {
  return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: seconds });
}

/** Archivos elegidos en el móvil (o arrastrados) → lo que sube el uploader del backend. */
export function collectFiles(files) {
  const list = Array.isArray(files) ? files : [];
  return list
    .filter((file) => typeof file?.arrayBuffer === 'function' && isAudioFile(file.name))
    .map((file) => ({ name: file.webkitRelativePath || file.name, size: file.size, open: async () => new Uint8Array(await file.arrayBuffer()) }));
}

/**
 * window.api de Android: los mismos métodos que el preload de Electron (src/preload/preload.cjs),
 * pero el "proceso main" es el backend compartido corriendo aquí mismo, con los plugins nativos.
 * La clave secreta tampoco sale de este módulo hacia la interfaz.
 *
 * @param {{ files, crypto, http, coverUrl: (name: string) => string, document, userAgent: string,
 *   App?: { addListener }, prepare?: () => Promise<void>, presign?: typeof presignUrl, timers?: object }} deps
 *   `http`: plugin CapacitorHttp · `crypto`: createKeystoreCrypto() · `files`: createCapacitorFiles() ·
 *   `prepare`: lo que hay que resolver antes de arrancar (carpeta de las carátulas, prefijo del Keystore)
 */
export function createAndroidApi(deps) {
  const listeners = { changed: new Set(), updated: new Set(), progress: new Set(), lists: new Set(), favorites: new Set() };
  const emit = (kind, payload) => {
    for (const listener of listeners[kind]) listener(payload);
  };
  const subscribe = (kind) => (callback) => {
    listeners[kind].add(callback);
    return () => listeners[kind].delete(callback);
  };
  const ready = start(deps, emit);
  const call =
    (task) =>
    async (...args) =>
      task(await ready, ...args);

  return {
    ready,

    // Biblioteca (en el bucket S3)
    loadLibrary: call(({ store, present, trackOf }) => present(store.all().map(trackOf))),
    syncLibrary: call(async ({ librarySync, lists, favorites }) => {
      const [{ added, removed }] = await Promise.all([librarySync.sync(), lists.sync(), favorites.sync()]);
      return { added: added.length, removed: removed.length };
    }),
    verifyTrack: call(({ librarySync }, id) => (typeof id === 'string' ? librarySync.verify(id) : false)),
    onLibraryChanged: subscribe('changed'),
    chooseUploads: call(async ({ uploader }) => {
      const files = await pickFiles(deps.document, { accept: AUDIO_ACCEPT, multiple: true });
      return files ? uploader.upload(files) : null;
    }),
    uploadPaths: call(({ uploader }, files) => uploader.upload(files)),
    /** En Android no hay rutas: el propio File arrastrado es lo que se sube. */
    pathForFile: (file) => file,
    onUploadProgress: subscribe('progress'),

    // Conexión S3 (la clave secreta nunca vuelve a la interfaz)
    getConnection: call(({ s3 }) => s3.summary()),
    saveConnection: call(({ s3 }, input) => s3.connect(input ?? {})),
    importCredentials: call(async ({ s3 }) => {
      const [file] = (await pickFiles(deps.document, { accept: '.json,application/json' })) ?? [];
      return file ? s3.importCredentials(await file.text()) : null;
    }),

    // Listas de canciones (compartidas por todos los Pulse del mismo bucket)
    getLists: call(({ lists }) => lists.all()),
    createList: call(({ lists }, name, paths) => listResult(() => lists.create(name, Array.isArray(paths) ? paths : []))),
    renameList: call(({ lists }, id, name) => listResult(() => lists.rename(String(id), name))),
    addToList: call(({ lists }, id, paths) => listResult(() => lists.add(String(id), Array.isArray(paths) ? paths : []))),
    removeFromList: call(({ lists }, id, path) => listResult(() => lists.removeTrack(String(id), String(path)))),
    deleteList: call(({ lists }, id) => listResult(() => lists.remove(String(id)))),
    onListsChanged: subscribe('lists'),

    // Favoritos (compartidos como las listas)
    getFavorites: call(({ favorites }) => favorites.all()),
    setFavorite: call(({ favorites }, path, favorite) => favoriteResult(() => favorites.set(path, favorite === true))),
    importFavorites: call(({ favorites }, paths) => favoriteResult(() => favorites.import(Array.isArray(paths) ? paths : []))),
    onFavoritesChanged: subscribe('favorites'),

    // Datos de internet
    lookupTrack: call(async ({ store, queue, present }, id, options = {}) => {
      if (typeof id !== 'string' || !store.has(id)) throw new TypeError('Pista desconocida');
      const result = await queue.lookupNow(id, { force: options?.force === true, lyrics: true });
      return result && { ...result, track: (await present([result.track]))[0] };
    }),
    setOnlineLookup: call(({ queue }, enabled) => queue.setEnabled(enabled === true)),
    onTracksUpdated: subscribe('updated'),
  };
}

async function start({ files, crypto, http, coverUrl, userAgent, App, prepare, presign = presignUrl, timers = globalThis }, emit) {
  await prepare?.();
  const trackOf = (record) => toTrack(record, NO_URLS);
  let metadata = null;
  const store = createLibraryStore(files, { onSave: () => metadata?.schedulePush() });
  await store.load();

  const requestHandler = createS3RequestHandler(http);
  const s3 = createS3Service({
    connections: createConnectionStore(files, crypto),
    createStorage: (config) => createS3Storage(config, { requestHandler }),
  });
  await s3.load();
  metadata = createMetadataStore({ getStorage: () => s3.storage(), getRecords: () => store.all(), files });
  metadata.schedulePush(); // lo que ya hay en el móvil también llega al bucket
  const lists = createListStore({ files, getStorage: () => s3.storage(), onChange: (all) => emit('lists', all), timers });
  await lists.load();
  const favorites = createFavoriteStore({ files, getStorage: () => s3.storage(), onChange: (all) => emit('favorites', all), timers });
  await favorites.load();

  const covers = createCoverCache({
    files,
    toUrl: coverUrl,
    readEmbedded: (record) => (s3.storage() ? readRemoteCover(s3.storage(), record) : null),
    readCover: (name) => metadata.readCover(name),
    getRecord: (id) => store.get(id),
    onReady: (ids) => present(ids.map((id) => store.get(id)).filter(Boolean).map(trackOf)).then((tracks) => emit('updated', tracks)),
    timers,
  });
  await covers.load();

  /** Pistas para la interfaz con las URLs de Android: audio firmado y carátula en covers/. */
  async function present(tracks) {
    const storage = s3.storage();
    return Promise.all(
      tracks.map(async (track) => {
        const target = parseTrackId(track.path);
        const url = storage && target?.bucket === storage.bucket ? await presign(storage, target.key) : '';
        return { ...track, url, cover: track.cover === null ? null : covers.url(store.get(track.path) ?? {}) };
      }),
    );
  }
  const emitTracks = (kind) => (tracks) => present(tracks).then((presented) => emit(kind, presented));

  const enricher = createEnricher({ http: createHttp(createNativeFetch(http), { userAgent }), files });
  const queue = createEnrichmentQueue({ store, enricher, toTrack: trackOf, onUpdated: emitTracks('updated'), timers });
  const librarySync = createLibrarySync({
    store,
    getStorage: () => s3.storage(),
    toTrack: trackOf,
    pullMetadata: () => metadata.pull(),
    onChange: (change) => {
      present(change.added).then((added) => emit('changed', { ...change, added }));
      if (change.added.length > 0) queue.wake();
    },
    onUpdated: emitTracks('updated'),
  });
  const uploader = createUploader({
    getStorage: () => s3.storage(),
    collect: collectFiles,
    afterUpload: () => librarySync.sync(),
    onProgress: (progress) => emit('progress', progress),
  });

  // Cambios hechos en el bucket desde fuera (canciones, listas y favoritos): al arrancar y al volver a la app.
  // Al salir, se sube lo pendiente.
  const syncSoon = () => {
    librarySync.syncSoon();
    lists.syncSoon();
    favorites.syncSoon();
  };
  syncSoon();
  App?.addListener('resume', syncSoon);
  App?.addListener('pause', () => {
    metadata.flush();
    if (lists.hasPending()) lists.sync();
    if (favorites.hasPending()) favorites.sync();
  });

  return { store, s3, librarySync, uploader, queue, covers, metadata, lists, favorites, present, trackOf };
}
