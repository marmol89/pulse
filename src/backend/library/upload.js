import { basename, extname } from '../paths.js';
import { mimeFor } from './tracks.js';
import { describeUploadError } from '../s3/storage.js';

const MAX_RENAMES = 50; // "Canción (2).mp3" … "Canción (50).mp3"

/** "Canción.mp3" → "Canción (2).mp3" */
function renamed(key, n) {
  const ext = extname(key);
  return `${key.slice(0, key.length - ext.length)} (${n})${ext}`;
}

/**
 * Clave libre para subir: la misma si no existe; null si ya está ese archivo (mismo tamaño);
 * si hay otro distinto con ese nombre, "Nombre (2).mp3", "(3)"… Nunca sobrescribe.
 */
export async function freeKey(storage, key, size) {
  for (let n = 1; n <= MAX_RENAMES; n += 1) {
    const candidate = n === 1 ? key : renamed(key, n);
    const existing = await storage.stat(candidate);
    if (!existing) return candidate;
    if (existing.size === size) return null;
  }
  throw new Error('Hay demasiados archivos con ese nombre en el bucket');
}

/**
 * Sube canciones al bucket (bajo la carpeta de la conexión) y después sincroniza, así llegan a la
 * biblioteca como cualquier otra canción nueva. Las subidas van de una en una.
 * `collect(entrada)` es de cada plataforma: rutas del ordenador en Electron, archivos elegidos en
 * Android. Devuelve `{ name, size, open() }`: el nombre en el bucket ("Disco/01.mp3"), el tamaño
 * exacto y el cuerpo que se sube (stream, Blob o bytes).
 */
export function createUploader({ getStorage, collect, afterUpload = async () => {}, onProgress = () => {} }) {
  let queue = Promise.resolve();

  async function run(input) {
    const storage = getStorage();
    if (!storage) return { ok: false, needsConnection: true, error: 'Conecta tu bucket antes de subir canciones' };
    const files = await collect(input);
    const result = { ok: true, total: files.length, uploaded: 0, skipped: 0, failed: [] };
    for (const [index, { name, size, open }] of files.entries()) {
      onProgress({ current: index + 1, total: files.length, name: basename(name) });
      try {
        const key = await freeKey(storage, `${storage.prefix}${name}`, size);
        if (key === null) {
          result.skipped += 1;
          continue;
        }
        await storage.upload(key, await open(), { size, contentType: mimeFor(key) });
        result.uploaded += 1;
      } catch (error) {
        result.failed.push({ name, error: describeUploadError(error) });
      }
    }
    // Si ahora no se puede sincronizar, las subidas aparecerán en la próxima sincronización.
    if (result.uploaded > 0) await afterUpload().catch((error) => console.warn('[s3] no se pudo sincronizar tras subir', error));
    return result;
  }

  return {
    /**
     * @param {unknown} input lo que entiende `collect` (p. ej. rutas absolutas de archivos y carpetas)
     * @returns {Promise<{ ok: true, total, uploaded, skipped, failed: Array<{ name, error }> } | { ok: false, error, needsConnection? }>}
     */
    upload(input) {
      const next = queue.then(() => run(input));
      queue = next.catch(() => {});
      return next;
    },
  };
}
