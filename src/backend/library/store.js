import { basename } from '../paths.js';
import { keepNewestEdits } from './edits.js';

const VERSION = 1;
export const LIBRARY_FILE = 'library.json';

/** Las carátulas de internet se guardaban con su ruta en este equipo; ahora, por nombre. */
function migrate({ coverFile, ...record }) {
  return coverFile && !record.coverName ? { ...record, coverName: basename(coverFile) } : record;
}

/**
 * Biblioteca persistida en library.json (en los archivos de la app: `files`). También sirve como
 * lista de pistas permitidas para el protocolo media://. `onSave` se llama tras cada guardado
 * (lo usa la copia en metadatos/ del bucket).
 */
export function createLibraryStore(files, { onSave = () => {} } = {}) {
  const records = new Map();
  let saving = Promise.resolve();

  async function write() {
    await files.write(LIBRARY_FILE, JSON.stringify({ version: VERSION, tracks: [...records.values()] }));
    onSave();
  }

  return {
    async load() {
      try {
        const text = await files.readText(LIBRARY_FILE);
        if (text === null) return;
        for (const record of JSON.parse(text).tracks ?? []) if (record?.path) records.set(record.path, migrate(record));
      } catch (error) {
        console.warn('[library] no se pudo leer la biblioteca, se empieza vacía', error);
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

    /** Lo editado a mano solo lo cambia una edición más reciente (no la cola de internet ni releer el archivo). */
    add(list) {
      for (const record of list) records.set(record.path, keepNewestEdits(record, records.get(record.path)));
    },

    remove(paths) {
      for (const filePath of paths) records.delete(filePath);
    },

    /** Las escrituras se encadenan para que dos importaciones seguidas no se pisen. */
    save() {
      saving = saving.then(write, write);
      return saving;
    },
  };
}
