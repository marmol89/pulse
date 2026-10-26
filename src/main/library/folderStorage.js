import { createReadStream } from 'node:fs';
import { open, opendir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { isAudioFile } from '../../backend/library/tracks.js';

/** Carpetas que no tienen música y no se recorren (además de las ocultas, que empiezan por "."). */
const SKIPPED = new Set(['$RECYCLE.BIN', 'System Volume Information', 'node_modules']);

/** Error con el nombre que entiende protocol/responses.js (como los del SDK de S3). */
function named(name, message) {
  return Object.assign(new Error(message), { name });
}

const READ_ONLY = () => Promise.reject(new TypeError('Pulse no modifica las carpetas de tu equipo'));

/**
 * Rango pedido por el <audio> ("bytes=a-b", "bytes=a-" o "bytes=-n") dentro de un archivo de `size` bytes:
 * { start, end } (incluido), null si no pide rango, o lanza InvalidRange si no se puede servir.
 */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) throw named('InvalidRange', 'Rango no válido');
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) throw named('InvalidRange', 'Rango fuera del archivo');
  return { start, end };
}

/**
 * Música de carpetas del ordenador con la forma del storage de S3 (s3/storage.js), para que la sincronización,
 * las carátulas y el protocolo media:// funcionen igual. De solo lectura: Pulse nunca escribe, mueve ni borra
 * en ellas (`readOnly`; los metadatos, listas y favoritos se quedan en userData).
 * La clave de cada canción es su ruta absoluta con "/" ("C:/Música/Disco/01.mp3"); solo se leen archivos de
 * audio que estén dentro de las carpetas elegidas.
 *
 * @param {Array<{ id: string, name: string }>} folders `id`: ruta absoluta de la carpeta
 */
export function createFolderStorage(folders) {
  const roots = folders.map((folder) => ({ ...folder, root: path.resolve(folder.id) }));
  const toKey = (file) => file.split(path.sep).join('/');

  /** Ruta en disco de una clave, solo si es audio y está dentro de alguna carpeta elegida. */
  function fileOf(key) {
    const file = path.resolve(String(key));
    const inside = roots.some(({ root }) => file.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`));
    if (!inside || !isAudioFile(toKey(file))) throw named('NoSuchKey', 'Fuera de tus carpetas');
    return file;
  }

  async function walk(folder, found) {
    let dir;
    try {
      dir = await opendir(folder);
    } catch (error) {
      if (folder !== found.root) return; // una subcarpeta sin permiso no impide leer las demás
      throw new TypeError(error.code === 'ENOENT' ? `No se encuentra la carpeta «${found.name}»` : `No se puede leer la carpeta «${found.name}»`);
    }
    for await (const entry of dir) {
      if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full, found);
      else if (entry.isFile() && isAudioFile(entry.name)) {
        const info = await stat(full).catch(() => null);
        if (info) found.objects.set(toKey(full), info);
      }
    }
  }

  return {
    bucket: 'carpetas',
    prefix: '',
    scheme: 'local',
    readOnly: true,

    /** Todos los archivos de audio de las carpetas (sin repetir si una está dentro de otra). */
    async listAudio() {
      const objects = new Map();
      for (const { root, name } of roots) await walk(root, { root, name, objects });
      return [...objects].map(([key, info]) => ({
        key,
        size: info.size,
        etag: `${info.size}-${Math.trunc(info.mtimeMs)}`, // cambia si se edita el archivo (o sus etiquetas)
        lastModified: Math.trunc(info.birthtimeMs || info.mtimeMs),
      }));
    },

    async readStart(key, bytes) {
      const handle = await open(fileOf(key), 'r');
      try {
        const buffer = new Uint8Array(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },

    /** En las carpetas no hay metadatos de Pulse que leer. */
    read: async () => null,

    /** El archivo (o un rango) como stream web, con las cabeceras para responder al <audio>. */
    async getObject(key, range) {
      const file = fileOf(key);
      const { size } = await stat(file).catch((error) => {
        throw error.code === 'ENOENT' ? named('NoSuchKey', 'No encontrado') : error;
      });
      const part = parseRange(range, size);
      const { start, end } = part ?? { start: 0, end: size - 1 };
      return {
        status: part ? 206 : 200,
        contentLength: size === 0 ? 0 : end - start + 1,
        contentRange: part ? `bytes ${start}-${end}/${size}` : undefined,
        body: size === 0 ? new Blob([]).stream() : Readable.toWeb(createReadStream(file, { start, end })),
      };
    },

    async stat(key) {
      try {
        return { size: (await stat(fileOf(key))).size };
      } catch (error) {
        if (error.code === 'ENOENT' || error.name === 'NoSuchKey') return null;
        throw error;
      }
    },

    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    upload: READ_ONLY,
    copy: READ_ONLY,
    remove: READ_ONLY,
    destroy() {},
  };
}
