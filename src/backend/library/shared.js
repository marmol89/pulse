import { METADATA_FOLDER } from './metadata.js';
import { describeUploadError } from '../s3/storage.js';

const VERSION = 1;
const PUSH_DELAY_MS = 2_000; // agrupa varios cambios seguidos (añadir varias canciones) en una subida
const RETRY_MS = 60_000; // sin red o con un error del servidor, se reintenta
const MIN_INTERVAL_MS = 15_000; // como la biblioteca: como mucho una sincronización automática cada 15 s

/**
 * Dos copias de los registros → una: por cada id gana el cambiado más tarde (`updatedAt`; si empatan, `a`).
 * Los borrados se quedan como marca (`deleted`) para que otra copia no los resucite. En orden de `createdAt`.
 */
export function mergeRecords(a, b) {
  const merged = new Map(a.map((record) => [record.id, record]));
  for (const record of b) {
    const mine = merged.get(record.id);
    if (!mine || record.updatedAt > mine.updatedAt) merged.set(record.id, record);
  }
  return [...merged.values()].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
}

/**
 * Resultado de una operación para la interfaz: { ok: true, [key]: valor } (o los campos del objeto devuelto)
 * o, si el usuario pidió algo que no se puede (nombre vacío, sin conexión…), { ok: false, error } en español.
 */
export function resultOf(key) {
  return async (task) => {
    try {
      const value = await task();
      return { ok: true, ...(Array.isArray(value) ? { [key]: value } : value) };
    } catch (error) {
      if (error instanceof TypeError) return { ok: false, error: error.message };
      throw error;
    }
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Registros del usuario compartidos por todos los Pulse conectados al mismo bucket (metadatos/<remoteFile>,
 * bajo la carpeta de la conexión). Cada cambio se guarda al momento en este equipo (`localFile`) y se sube
 * poco después; `sync()` (al arrancar, al volver a la app y con "Actualizar biblioteca") trae lo de los demás
 * y avisa con `onChange(visibles)`. Cada registro: { id, createdAt, updatedAt, deleted?, … }.
 * `key` es el campo de los JSON, `valid` filtra lo que llega y `show` da la forma que ve la interfaz.
 */
export function createSharedRecords({
  key, localFile, remoteFile, tag, label, offlineMessage, valid, show,
  files, getStorage, onChange = () => {}, now = Date.now, delay = PUSH_DELAY_MS, retry = RETRY_MS, minInterval = MIN_INTERVAL_MS, timers = globalThis,
}) {
  let scope = null; // "bucket/carpeta" de la conexión a la que pertenecen
  let records = [];
  let timer = null;
  let running = null;
  let lastSyncAt = Number.NEGATIVE_INFINITY;
  let lastWarning = '';

  const scopeOf = (storage) => (storage ? `${storage.bucket}/${storage.prefix}` : null);
  const remoteKey = (storage) => `${storage.prefix}${METADATA_FOLDER}${remoteFile}`;
  const visible = () => records.filter((record) => !record.deleted).map(show);
  const saveLocal = () => files.write(localFile, JSON.stringify({ version: VERSION, scope, [key]: records }));

  function warn(message, error) {
    const text = `${message}: ${describeUploadError(error)}`;
    if (text !== lastWarning) console.warn(`[${tag}] ${text}`);
    lastWarning = text;
  }

  /** Si cambió la conexión, los registros de la anterior no valen: se empieza vacío y se traen los del bucket. */
  function currentScope() {
    const storage = getStorage();
    if (!storage) throw new TypeError(offlineMessage);
    if (scopeOf(storage) !== scope) {
      const hadRecords = visible().length > 0;
      scope = scopeOf(storage);
      records = [];
      if (hadRecords) onChange([]); // la ventana deja de enseñar los de la conexión anterior
    }
    return storage;
  }

  /** Lee los del bucket, los junta con los de aquí y sube el resultado si el bucket no lo tenía ya. */
  async function reconcile() {
    timers.clearTimeout(timer);
    timer = null;
    const storage = getStorage();
    if (!storage) return;
    currentScope();
    try {
      const data = await storage.read(remoteKey(storage)); // null si aún no hay: un error lanza y no se pisa nada
      const remote = data ? (JSON.parse(new TextDecoder().decode(data))[key] ?? []).filter(valid) : [];
      const merged = mergeRecords(records, remote);
      if (!same(merged, records)) {
        const before = visible();
        records = merged;
        await saveLocal();
        if (!same(before, visible())) onChange(visible());
      }
      if (!same(merged, mergeRecords(remote, []))) {
        const bytes = new TextEncoder().encode(JSON.stringify({ version: VERSION, [key]: merged }));
        await storage.upload(remoteKey(storage), bytes, { size: bytes.length, contentType: 'application/json' });
      }
      lastSyncAt = now();
      lastWarning = '';
    } catch (error) {
      warn(`no se pudieron sincronizar ${label} con el bucket (siguen en este equipo)`, error);
      schedule(retry);
    }
  }

  function schedule(wait) {
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => sync().catch(() => {}), wait);
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
        const text = await files.readText(localFile);
        if (text === null) return;
        const saved = JSON.parse(text);
        scope = saved.scope ?? null;
        records = (saved[key] ?? []).filter(valid);
      } catch (error) {
        console.warn(`[${tag}] no se pudo leer ${localFile}, se empieza vacío`, error);
      }
    },

    /** Los de la conexión actual ([] sin conexión), en orden de creación. */
    all() {
      return scopeOf(getStorage()) === scope ? visible() : [];
    },

    /**
     * Cambia los registros de la conexión actual: `change(registros)` devuelve los nuevos (o los mismos, si no
     * cambia nada) y puede lanzar un TypeError para el usuario. Se guarda al momento y se sube poco después.
     * @returns {Promise<object[]>} los visibles
     */
    async update(change) {
      currentScope();
      const next = change(records);
      if (next !== records) {
        records = next;
        await saveLocal();
        schedule(delay);
      }
      return visible();
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
