import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Archivos de la app dentro de una carpeta (userData), por nombre relativo ("library.json",
 * "covers/abc.jpg"): el adaptador `files` que usa el backend en Electron.
 */
export function createNodeFiles(root) {
  const full = (name) => path.join(root, ...String(name).split('/'));

  async function readOrNull(name, encoding) {
    try {
      return await readFile(full(name), encoding);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  return {
    /** Contenido (Uint8Array) o null si no existe. */
    read: (name) => readOrNull(name),

    /** Texto UTF-8 o null si no existe. */
    readText: (name) => readOrNull(name, 'utf8'),

    /** Escritura atómica: nunca queda un archivo a medias. */
    async write(name, data) {
      const file = full(name);
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(temporary, data);
      await rename(temporary, file);
    },

    exists: (name) =>
      access(full(name)).then(
        () => true,
        () => false,
      ),

    remove: (name) => rm(full(name), { force: true }),
  };
}
