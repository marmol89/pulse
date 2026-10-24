import { METADATA_FOLDER } from './metadata.js';
import { describeUploadError } from '../s3/storage.js';

/** Caché local (en los archivos de la app) y copia compartida en el bucket, bajo la carpeta de la conexión. */
export const LISTS_FILE = 'lists.json';
const REMOTE_FILE = 'listas.json';
const VERSION = 1;
const MAX_NAME = 100;
const MAX_TRACKS = 5_000;
const PUSH_DELAY_MS = 2_000; // agrupa varios cambios seguidos (añadir varias canciones) en una subida
const RETRY_MS = 60_000; // sin red o con un error del servidor, se reintenta
const MIN_INTERVAL_MS = 15_000; // como la biblioteca: como mucho una sincronización automática cada 15 s

/** Id aleatorio con getRandomValues (randomUUID pide un contexto seguro que el WebView no siempre da). */
function randomId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Dos copias de las listas → una: por cada lista gana la editada más tarde (`updatedAt`; si empatan, `a`).
 * Las borradas se quedan como marca (`deleted`) para que otra copia no las resucite.
 */
export function mergeLists(a, b) {
  const merged = new Map(a.map((list) => [list.id, list]));
  for (const list of b) {
    const mine = merged.get(list.id);
    if (!mine || list.updatedAt > mine.updatedAt) merged.set(list.id, list);
  }
  return [...merged.values()].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
}

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
  if (!text) throw new TypeError('Ponle un nombre a la lista');
  return text;
}

function cleanPaths(paths) {
  return Array.isArray(paths) ? [...new Set(paths.filter((path) => typeof path === 'string' && path.startsWith('s3://')))] : [];
}

/**
 * Resultado de una operación para la interfaz: { ok: true, lists, id? } o, si el usuario pidió algo que no
 * se puede (nombre vacío, lista borrada, sin conexión), { ok: false, error } con el mensaje en español.
 */
export async function listResult(task) {
  try {
    const value = await task();
    return { ok: true, ...(Array.isArray(value) ? { lists: value } : value) };
  } catch (error) {
    if (error instanceof TypeError) return { ok: false, error: error.message };
    throw error;
  }
}

const valid = (list) => typeof list?.id === 'string' && typeof list.updatedAt === 'number' && (list.deleted || (typeof list.name === 'string' && Array.isArray(list.tracks)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Listas de canciones creadas por el usuario, compartidas por todos los Pulse conectados al mismo bucket
 * (metadatos/listas.json). Cada cambio se guarda al momento en este equipo y se sube poco después;
 * `sync()` (al arrancar, al volver a la app y con "Actualizar biblioteca") trae lo de los demás y
 * avisa con `onChange(listas)`. Cada lista: { id, name, tracks: id[], createdAt, updatedAt }.
 */
export function createListStore({ files, getStorage, onChange = () => {}, now = Date.now, newId = randomId, delay = PUSH_DELAY_MS, retry = RETRY_MS, minInterval = MIN_INTERVAL_MS, timers = globalThis }) {
  let scope = null; // "bucket/carpeta" de la conexión a la que pertenecen las listas
  let lists = [];
  let timer = null;
  let running = null;
  let lastSyncAt = Number.NEGATIVE_INFINITY;
  let lastWarning = '';

  const scopeOf = (storage) => (storage ? `${storage.bucket}/${storage.prefix}` : null);
  const remoteKey = (storage) => `${storage.prefix}${METADATA_FOLDER}${REMOTE_FILE}`;
  const visible = () => lists.filter((list) => !list.deleted).map(({ id, name, tracks, createdAt, updatedAt }) => ({ id, name, tracks: [...tracks], createdAt, updatedAt }));
  const saveLocal = () => files.write(LISTS_FILE, JSON.stringify({ version: VERSION, scope, lists }));

  function warn(message, error) {
    const text = `${message}: ${describeUploadError(error)}`;
    if (text !== lastWarning) console.warn(`[listas] ${text}`);
    lastWarning = text;
  }

  /** Si cambió la conexión, las listas de la anterior no valen: se empieza vacío y se traen las del bucket. */
  function currentScope() {
    const storage = getStorage();
    if (!storage) throw new TypeError('Conecta tu bucket para usar las listas');
    if (scopeOf(storage) !== scope) {
      scope = scopeOf(storage);
      lists = [];
    }
    return storage;
  }

  async function change(id, update) {
    currentScope();
    const list = lists.find((item) => item.id === id && !item.deleted);
    if (!list) throw new TypeError('Esa lista ya no existe');
    lists = lists.map((item) => (item === list ? { ...update(list), updatedAt: Math.max(now(), list.updatedAt + 1) } : item));
    await saveLocal();
    schedulePush();
    return visible();
  }

  /** Lee las del bucket, las junta con las de aquí y sube el resultado si el bucket no lo tenía ya. */
  async function reconcile() {
    timers.clearTimeout(timer);
    timer = null;
    const storage = getStorage();
    if (!storage) return;
    currentScope();
    try {
      const data = await storage.read(remoteKey(storage)); // null si aún no hay: un error lanza y no se pisa nada
      const remote = data ? (JSON.parse(new TextDecoder().decode(data)).lists ?? []).filter(valid) : [];
      const merged = mergeLists(lists, remote);
      if (!same(merged, lists)) {
        const before = visible();
        lists = merged;
        await saveLocal();
        if (!same(before, visible())) onChange(visible());
      }
      if (!same(merged, mergeLists(remote, []))) {
        const bytes = new TextEncoder().encode(JSON.stringify({ version: VERSION, lists: merged }));
        await storage.upload(remoteKey(storage), bytes, { size: bytes.length, contentType: 'application/json' });
      }
      lastSyncAt = now();
      lastWarning = '';
    } catch (error) {
      warn('no se pudieron sincronizar las listas con el bucket (siguen en este equipo)', error);
      schedule(retry);
    }
  }

  function schedule(wait) {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => sync().catch(() => {}), wait);
  }

  function schedulePush() {
    schedule(delay);
  }

  /** Nunca van dos sincronizaciones a la vez: si hay una en marcha, se espera y se lanza otra. */
  function sync() {
    const next = (running ?? Promise.resolve()).then(reconcile, reconcile);
    running = next.finally(() => {
      if (running === next) running = null;
    });
    return next;
  }

  return {
    async load() {
      try {
        const text = await files.readText(LISTS_FILE);
        if (text === null) return;
        const saved = JSON.parse(text);
        scope = saved.scope ?? null;
        lists = (saved.lists ?? []).filter(valid);
      } catch (error) {
        console.warn('[listas] no se pudieron leer las listas guardadas, se empieza vacío', error);
      }
    },

    /** Listas de la conexión actual ([] sin conexión), en orden de creación. */
    all() {
      return scopeOf(getStorage()) === scope ? visible() : [];
    },

    /** Crea una lista (con canciones, si se dan). @returns {Promise<{ id: string, lists: object[] }>} */
    async create(name, paths = []) {
      currentScope();
      const at = now();
      const list = { id: newId(), name: cleanName(name), tracks: cleanPaths(paths).slice(0, MAX_TRACKS), createdAt: at, updatedAt: at };
      lists = [...lists, list];
      await saveLocal();
      schedulePush();
      return { id: list.id, lists: visible() };
    },

    rename(id, name) {
      const text = cleanName(name);
      return change(id, (list) => ({ ...list, name: text }));
    },

    /** Añade al final las que no estén ya. */
    add(id, paths) {
      return change(id, (list) => ({ ...list, tracks: [...new Set([...list.tracks, ...cleanPaths(paths)])].slice(0, MAX_TRACKS) }));
    },

    removeTrack(id, path) {
      return change(id, (list) => ({ ...list, tracks: list.tracks.filter((track) => track !== path) }));
    },

    remove(id) {
      return change(id, ({ id: listId, createdAt }) => ({ id: listId, createdAt, deleted: true }));
    },

    sync,

    /** Sincroniza si ha pasado un rato desde la última (al arrancar o volver a la app). */
    syncSoon() {
      if (now() - lastSyncAt >= minInterval) sync().catch(() => {});
    },

    /** ¿Hay cambios sin subir? (para no cerrar la app sin subirlos) */
    hasPending() {
      return timer !== null;
    },
  };
}
