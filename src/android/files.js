import { base64ToBytes, bytesToBase64 } from './nativeHttp.js';

/**
 * Archivos de la app en Android (plugin Filesystem, carpeta privada de datos de la app) por nombre
 * relativo ("library.json", "covers/abc.jpg"): el adaptador `files` del backend, como
 * src/main/files.js en Electron. `uri(name)` da la ruta file:// para mostrar una imagen.
 *
 * Si algo no existe se mira listando su carpeta antes de pedirlo: un plugin que rechaza
 * ("el archivo no existe") deja un error en la consola aunque se capture.
 *
 * @param {object} Filesystem plugin @capacitor/filesystem
 * @param {string} directory Directory.Data
 */
export function createCapacitorFiles(Filesystem, directory) {
  const at = (name) => ({ path: String(name), directory });
  const split = (name) => {
    const parts = String(name).split('/');
    return { folder: parts.slice(0, -1).join('/'), base: parts.at(-1) };
  };

  /** Nombres de una carpeta ('' es la raíz de los datos de la app, que siempre existe). */
  async function list(folder) {
    if (folder) {
      const { folder: parent, base } = split(folder);
      if (!(await list(parent)).includes(base)) return [];
    }
    const { files } = await Filesystem.readdir(at(folder));
    return files.map((entry) => (typeof entry === 'string' ? entry : entry.name));
  }

  async function exists(name) {
    const { folder, base } = split(name);
    return (await list(folder)).includes(base);
  }

  async function readOrNull(name, encoding) {
    if (!(await exists(name))) return null;
    const { data } = await Filesystem.readFile({ ...at(name), ...(encoding ? { encoding } : {}) });
    return data;
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
    list,

    async uri(name) {
      return (await Filesystem.getUri(at(name))).uri;
    },
  };
}
