import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isAudioFile } from '../../backend/library/tracks.js';

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

/**
 * Lo que sube el uploader del backend desde rutas del ordenador (del diálogo o arrastradas):
 * cada archivo se lee como stream al subirlo.
 * @returns {Promise<Array<{ name: string, size: number, open: () => import('node:stream').Readable }>>}
 */
export async function collectPaths(paths) {
  assertAbsolutePaths(paths);
  return (await collectUploads(paths)).map(({ file, name, size }) => ({ name, size, open: () => createReadStream(file) }));
}
