import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseTrackId } from './remote.js';
import { describeUploadError } from '../s3/storage.js';

/** Carpeta de los metadatos dentro del bucket (bajo la carpeta de la conexión). */
export const METADATA_FOLDER = 'metadatos/';
const LIBRARY_FILE = 'biblioteca.json';
const COVERS_FOLDER = 'caratulas/';
const VERSION = 1;
const PUSH_DELAY_MS = 5_000; // agrupa varios guardados seguidos en una sola subida
const MAX_PUSH_WAIT_MS = 60_000; // aunque no paren los guardados (búsqueda en segundo plano)

/** Última búsqueda en internet de un registro: entre dos copias, se queda la más reciente. */
export function lookupStamp(record) {
  return Math.max(record?.online?.checkedAt ?? 0, record?.online?.lyricsCheckedAt ?? 0);
}

/**
 * Copia de los metadatos de la biblioteca en el bucket: metadatos/biblioteca.json (datos de cada canción,
 * los de las etiquetas y los de internet) y metadatos/caratulas/ (carátulas descargadas de internet).
 * Así otro equipo conectado al mismo bucket no tiene que releer cada archivo ni volver a buscar en internet.
 * La copia local (library.json y covers/) sigue siendo la caché para arrancar al momento y sin conexión.
 */
export function createMetadataStore({ getStorage, getRecords, coversDir, delay = PUSH_DELAY_MS, maxWait = MAX_PUSH_WAIT_MS }) {
  const uploadedCovers = new Set(); // "bucket/clave" ya presentes en el bucket
  let timer = null;
  let firstPendingAt = 0;
  let pushing = Promise.resolve();
  let lastBody = '';
  let lastWarning = '';

  const key = (storage, name) => `${storage.prefix}${METADATA_FOLDER}${name}`;
  const coverKey = (storage, name) => key(storage, `${COVERS_FOLDER}${name}`);

  /** Avisa una sola vez de cada problema (p. ej. claves sin permiso de escritura). */
  function warn(message, error) {
    const text = `${message}: ${describeUploadError(error)}`;
    if (text !== lastWarning) console.warn(`[metadatos] ${text}`);
    lastWarning = text;
  }

  async function uploadCovers(storage, records) {
    const names = new Set(records.map((record) => record.coverName).filter(Boolean));
    for (const name of names) {
      const id = `${storage.bucket}/${coverKey(storage, name)}`;
      if (uploadedCovers.has(id)) continue;
      if (!(await storage.stat(coverKey(storage, name)))) {
        const data = await readFile(path.join(coversDir, name)).catch(() => null);
        if (!data) continue; // ni en este equipo: se subirá quien la tenga
        await storage.upload(coverKey(storage, name), data, { size: data.length, contentType: 'image/jpeg' });
      }
      uploadedCovers.add(id);
    }
  }

  async function push() {
    clearTimeout(timer);
    timer = null;
    firstPendingAt = 0;
    const storage = getStorage();
    if (!storage) return;
    const records = getRecords().filter((record) => parseTrackId(record.path)?.bucket === storage.bucket);
    try {
      // Primero las carátulas: quien lea el JSON ya las encuentra en el bucket.
      await uploadCovers(storage, records);
      const body = JSON.stringify({ version: VERSION, tracks: records });
      if (body === lastBody) return;
      await storage.upload(key(storage, LIBRARY_FILE), Buffer.from(body), { size: Buffer.byteLength(body), contentType: 'application/json' });
      lastBody = body;
      lastWarning = '';
    } catch (error) {
      warn('no se pudieron guardar los metadatos en el bucket (siguen en este equipo)', error);
    }
  }

  return {
    /**
     * Metadatos guardados en el bucket conectado (solo los de ese bucket); [] si aún no hay o no se pueden leer.
     * @returns {Promise<object[]>}
     */
    async pull() {
      const storage = getStorage();
      if (!storage) return [];
      try {
        const data = await storage.read(key(storage, LIBRARY_FILE));
        if (!data) return [];
        const tracks = JSON.parse(data.toString('utf8')).tracks ?? [];
        return tracks.filter((record) => record?.path && parseTrackId(record.path)?.bucket === storage.bucket);
      } catch (error) {
        warn('no se pudieron leer los metadatos del bucket', error);
        return [];
      }
    },

    /** Programa una subida (tras cada guardado de la biblioteca). */
    schedulePush() {
      firstPendingAt ||= Date.now();
      clearTimeout(timer);
      const wait = Math.max(0, Math.min(delay, firstPendingAt + maxWait - Date.now()));
      timer = setTimeout(() => this.flush(), wait);
    },

    /** ¿Hay una subida pendiente? (para no cerrar la app sin hacerla) */
    hasPending() {
      return timer !== null;
    },

    /** Sube ya lo pendiente. Las subidas se encadenan: nunca van dos a la vez. */
    flush() {
      pushing = pushing.then(push, push);
      return pushing;
    },

    /** Carátula de internet por nombre: de la caché local o, si no está, del bucket (y se guarda en la caché). */
    async readCover(name) {
      const file = path.join(coversDir, path.basename(name));
      const cached = await readFile(file).catch(() => null);
      if (cached) return cached;
      const storage = getStorage();
      const data = storage ? await storage.read(coverKey(storage, path.basename(name))) : null;
      if (!data) return null;
      await mkdir(coversDir, { recursive: true });
      await writeFile(file, data);
      return data;
    },
  };
}
