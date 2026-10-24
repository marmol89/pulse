import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isAudioFile, mimeFor } from './tracks.js';
import { describeUploadError } from '../s3/storage.js';

const MAX_RENAMES = 50; // "Canción (2).mp3" … "Canción (50).mp3"

/** Las rutas llegan del renderer: solo se aceptan rutas absolutas. */
export function assertAbsolutePaths(paths) {
  if (!Array.isArray(paths) || !paths.every((entry) => typeof entry === 'string' && path.isAbsolute(entry))) {
    throw new TypeError('Se esperaba una lista de rutas absolutas');
  }
}

/**
 * Archivos de audio de una lista de archivos y carpetas (recorridas enteras), con el nombre que
 * tendrán en el bucket: el del archivo o, dentro de una carpeta, "Carpeta/sub/archivo.mp3".
 * @returns {Promise<Array<{ file: string, name: string, size: number }>>}
 */
export async function collectUploads(paths) {
  const found = new Map();
  for (const target of paths) {
    const info = await stat(target).catch(() => null); // inexistente o sin permisos: se ignora
    if (info?.isFile() && isAudioFile(target)) found.set(target, { file: target, name: path.basename(target), size: info.size });
    if (info?.isDirectory()) await collectFolder(target, path.basename(target), found);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

async function collectFolder(dir, name, found) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFolder(full, `${name}/${entry.name}`, found);
    else if (entry.isFile() && isAudioFile(full)) {
      const info = await stat(full).catch(() => null);
      if (info) found.set(full, { file: full, name: `${name}/${entry.name}`, size: info.size });
    }
  }
}

/** "Canción.mp3" → "Canción (2).mp3" */
function renamed(key, n) {
  const ext = path.posix.extname(key);
  return `${key.slice(0, key.length - ext.length)} (${n})${ext}`;
}

/**
 * Clave libre para subir: la misma si no existe; null si ya está ese archivo (mismo tamaño);
 * si hay otro distinto con ese nombre, "Nombre (2).mp3", "(3)"… Nunca sobrescribe.
 */
async function freeKey(storage, key, size) {
  for (let n = 1; n <= MAX_RENAMES; n += 1) {
    const candidate = n === 1 ? key : renamed(key, n);
    const existing = await storage.stat(candidate);
    if (!existing) return candidate;
    if (existing.size === size) return null;
  }
  throw new Error('Hay demasiados archivos con ese nombre en el bucket');
}

/**
 * Sube canciones del ordenador al bucket (bajo la carpeta de la conexión) y después sincroniza,
 * así llegan a la biblioteca como cualquier otra canción nueva. Las subidas van de una en una.
 */
export function createUploader({ getStorage, afterUpload = async () => {}, onProgress = () => {}, openFile = createReadStream }) {
  let queue = Promise.resolve();

  async function run(paths) {
    assertAbsolutePaths(paths);
    const storage = getStorage();
    if (!storage) return { ok: false, needsConnection: true, error: 'Conecta tu bucket antes de subir canciones' };
    const files = await collectUploads(paths);
    const result = { ok: true, total: files.length, uploaded: 0, skipped: 0, failed: [] };
    for (const [index, { file, name, size }] of files.entries()) {
      onProgress({ current: index + 1, total: files.length, name: path.posix.basename(name) });
      try {
        const key = await freeKey(storage, `${storage.prefix}${name}`, size);
        if (key === null) {
          result.skipped += 1;
          continue;
        }
        await storage.upload(key, openFile(file), { size, contentType: mimeFor(key) });
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
     * @param {string[]} paths archivos y carpetas (rutas absolutas)
     * @returns {Promise<{ ok: true, total, uploaded, skipped, failed: Array<{ name, error }> } | { ok: false, error, needsConnection? }>}
     */
    upload(paths) {
      const next = queue.then(() => run(paths));
      queue = next.catch(() => {});
      return next;
    },
  };
}
