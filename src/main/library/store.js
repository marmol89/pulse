import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

const VERSION = 1;

/**
 * Biblioteca persistida en un JSON (en userData). También sirve como lista de
 * rutas permitidas para el protocolo media://.
 */
export function createLibraryStore(file) {
  const records = new Map();
  let saving = Promise.resolve();

  async function write() {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: VERSION, tracks: [...records.values()] }));
    await rename(temporary, file); // escritura atómica: nunca queda un JSON a medias
  }

  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(file, 'utf8'));
        for (const record of data.tracks ?? []) if (record?.path) records.set(record.path, record);
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[library] no se pudo leer la biblioteca, se empieza vacía', error);
      }
    },

    has(filePath) {
      return records.has(filePath);
    },

    get(filePath) {
      return records.get(filePath) ?? null;
    },

    all() {
      return [...records.values()];
    },

    add(list) {
      for (const record of list) records.set(record.path, record);
    },

    /** Las escrituras se encadenan para que dos importaciones seguidas no se pisen. */
    save() {
      saving = saving.then(write, write);
      return saving;
    },
  };
}
