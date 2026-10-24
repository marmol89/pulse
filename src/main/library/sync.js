import { toTrack } from './tracks.js';
import { parseTrackId, readRemoteRecord, trackId } from './remote.js';

const MIN_INTERVAL_MS = 15_000; // como mucho una sincronización automática cada 15 s
const CONCURRENCY = 4; // pistas leídas a la vez

/**
 * Mantiene la biblioteca igual que el bucket: añade lo nuevo, vuelve a leer lo que ha
 * cambiado (otro ETag) y quita lo borrado. Avisa de los cambios con `onChange`.
 */
export function createLibrarySync({ store, getStorage, onChange, readRecord = readRemoteRecord, now = Date.now, minInterval = MIN_INTERVAL_MS }) {
  let running = null;
  let lastSyncAt = Number.NEGATIVE_INFINITY;

  async function run() {
    const storage = getStorage();
    if (!storage) return { removed: [], added: [] };
    const present = new Set();
    const pending = [];
    for (const object of await storage.listAudio()) {
      const id = trackId(storage.bucket, object.key);
      present.add(id);
      if (store.get(id)?.etag !== object.etag) pending.push(object);
    }
    // También se quitan las de otro bucket (si cambió la conexión) o de versiones locales antiguas.
    const removed = store
      .all()
      .map((record) => record.path)
      .filter((id) => !present.has(id));
    const records = await mapLimit(pending, CONCURRENCY, (object) => readRecord(storage, object));
    store.remove(removed);
    store.add(records);
    if (removed.length + records.length > 0) await store.save();
    lastSyncAt = now();
    const change = { removed, added: records.map(toTrack) };
    if (removed.length + records.length > 0) onChange(change);
    return change;
  }

  return {
    /** Sincroniza ya. Si hay una sincronización en marcha, devuelve esa. */
    sync() {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },

    /** Sincroniza si ha pasado un rato desde la última (al arrancar o volver a la ventana). */
    syncSoon() {
      if (now() - lastSyncAt < minInterval) return;
      this.sync().catch((error) => console.warn('[s3] no se pudo sincronizar la biblioteca', error));
    },

    /** ¿Sigue la pista en el bucket? Si no, se quita de la biblioteca. Si S3 no responde, lanza. */
    async verify(id) {
      const storage = getStorage();
      const target = parseTrackId(id);
      if (!storage || !target || !store.has(id)) return false;
      if (await storage.exists(target.key)) return true;
      store.remove([id]);
      await store.save();
      return false;
    },
  };
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
