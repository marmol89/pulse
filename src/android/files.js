import { base64ToBytes, bytesToBase64 } from './nativeHttp.js';

/**
 * Archivos de la app en Android (plugin Filesystem, carpeta privada de datos de la app) por nombre
 * relativo ("library.json", "covers/abc.jpg"): el adaptador `files` del backend, como
 * src/main/files.js en Electron. `uri(name)` da la ruta file:// para mostrar una imagen.
 *
 * @param {object} Filesystem plugin @capacitor/filesystem
 * @param {string} directory Directory.Data
 */
export function createCapacitorFiles(Filesystem, directory) {
  const at = (name) => ({ path: String(name), directory });

  async function readOrNull(name, encoding) {
    try {
      const { data } = await Filesystem.readFile({ ...at(name), ...(encoding ? { encoding } : {}) });
      return data;
    } catch (error) {
      if (await exists(name)) throw error;
      return null;
    }
  }

  async function exists(name) {
    try {
      await Filesystem.stat(at(name));
      return true;
    } catch {
      return false;
    }
  }

  return {
    async read(name) {
      const data = await readOrNull(name);
      if (data === null) return null;
      return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
    },

    readText: (name) => readOrNull(name, 'utf8'),

    /** Escritura atómica: se escribe aparte y se renombra, nunca queda un archivo a medias. */
    async write(name, value) {
      const temporary = `${name}.tmp`;
      const content = typeof value === 'string' ? { data: value, encoding: 'utf8' } : { data: bytesToBase64(value) };
      await Filesystem.writeFile({ ...at(temporary), ...content, recursive: true });
      await Filesystem.rename({ from: temporary, to: String(name), directory, toDirectory: directory });
    },

    exists,

    async remove(name) {
      if (await exists(name)) await Filesystem.deleteFile(at(name));
    },

    /** Nombres de una carpeta ([] si no existe). */
    async list(folder) {
      try {
        const { files } = await Filesystem.readdir(at(folder));
        return files.map((entry) => (typeof entry === 'string' ? entry : entry.name));
      } catch {
        return [];
      }
    },

    async uri(name) {
      return (await Filesystem.getUri(at(name))).uri;
    },
  };
}
