import { parseTrackId, readRemoteRecord, trackId } from './remote.js';
import { lookupStamp } from './metadata.js';

const MIN_INTERVAL_MS = 15_000; // como mucho una sincronización automática cada 15 s
const CONCURRENCY = 4; // pistas leídas a la vez

/**
 * Mantiene la biblioteca igual que el bucket: añade lo nuevo, vuelve a leer lo que ha
 * cambiado (otro ETag) y quita lo borrado. Avisa de los cambios con `onChange`.
 * Antes de leer archivos usa los metadatos guardados en el bucket (`pullMetadata`): lo que ya
 * está ahí no se vuelve a leer, y los datos de internet más recientes llegan con `onUpdated`.
 * `toTrack` convierte un registro en la pista que ve la interfaz (con las URLs de cada plataforma).
 * `onPicture(registro, carátula)` recibe las carátulas incrustadas leídas, para guardarlas en el equipo.
 */
export function createLibrarySync({
  store,
  getStorage,
  toTrack,
  onChange,
  onUpdated = () => {},
  onPicture,
  pullMetadata = async () => [],
  readRecord = readRemoteRecord,
  now = Date.now,
  minInterval = MIN_INTERVAL_MS,
}) {
  let running = null;
  let lastSyncAt = Number.NEGATIVE_INFINITY;

  async function run() {
    const storage = getStorage();
    if (!storage) return { removed: [], added: [] };
    const objects = new Map((await storage.listAudio()).map((object) => [trackId(storage.bucket, object.key, storage.scheme), object]));
    const present = new Set(objects.keys());
    // La fecha de subida (para ordenar por "Añadidas recientemente") llega con el listado: no hace falta releer nada.
    const dated = (record) => withUploadDate(record, objects.get(record.path));
    const { known, improved } = fromMetadata(await pullMetadata(), objects);
    store.add([...known, ...improved].map(dated));
    const redated = store.all().filter((record) => objects.get(record.path)?.etag === record.etag && dated(record) !== record);
    store.add(redated.map(dated));
    improved.push(...redated);
    const pending = [...objects].filter(([id, object]) => store.get(id)?.etag !== object.etag).map(([, object]) => object);
    // También se quitan las de otro bucket (si cambió la conexión) o de versiones locales antiguas.
    const removed = store
      .all()
      .map((record) => record.path)
      .filter((id) => !present.has(id));
    // Si un objeto no se puede descargar ahora (red, S3), no se guarda: se reintenta en la próxima.
    const records = (await mapLimit(pending, CONCURRENCY, (object) => readRecord(storage, object, { onPicture }).catch(() => null))).filter(Boolean);
    store.remove(removed);
    store.add(records);
    const added = [...known, ...records].map((record) => store.get(record.path) ?? record);
    if (removed.length + added.length + improved.length > 0) await store.save();
    lastSyncAt = now();
    const change = { removed, added: added.map(toTrack) };
    if (removed.length + added.length > 0) onChange(change);
    if (improved.length > 0) onUpdated(improved.map((record) => toTrack(store.get(record.path) ?? record)));
    return change;
  }

  /**
   * De los metadatos del bucket, los que sirven: el objeto sigue igual (mismo ETag) y aquí no está
   * (`known`, no hace falta leerlo) o está con datos de internet más antiguos (`improved`).
   */
  function fromMetadata(remote, objects) {
    const known = [];
    const improved = [];
    for (const record of remote) {
      if (objects.get(record.path)?.etag !== record.etag) continue; // borrado o cambiado: se lee
      const local = store.get(record.path);
      if (local?.etag !== record.etag) known.push(record);
      else if (lookupStamp(record) > lookupStamp(local)) improved.push(record);
    }
    return { known, improved };
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

/** El registro con la fecha de subida de su objeto (el mismo registro si ya la tenía o no se sabe). */
function withUploadDate(record, object) {
  const addedAt = object?.lastModified;
  return addedAt && record.addedAt !== addedAt ? { ...record, addedAt } : record;
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
