import { basename } from '../paths.js';
import { readRemoteCover } from './remote.js';
import { imageFormat } from './tracks.js';

const CONCURRENCY = 4; // lecturas de carátulas del bucket a la vez

/** Huella corta y estable de un texto (FNV-1a de 32 bits, dos veces): nombres de archivo. */
export function fingerprint(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x811c9dc5) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Archivo de covers/ con la carátula de un registro: la incrustada (por pista y versión) o la de internet. */
export function coverFileName(record) {
  if (record.hasCover) return `embedded-${fingerprint(`${record.path}#${record.etag ?? ''}`)}.jpg`;
  return record.coverName ? basename(record.coverName) : null;
}

/**
 * Carátulas incrustadas guardadas en covers/ de los archivos de la app: cada una se descarga del bucket
 * una sola vez (o ninguna, si la sincronización la guarda con `save()` al leer las etiquetas).
 * Como mucho `concurrency` lecturas a la vez, para no saturar S3 al abrir una cuadrícula grande.
 * Un fallo de red no se recuerda (se reintenta en la próxima petición); "no tiene carátula", sí.
 */
export function createEmbeddedCovers({ files, getStorage, read = readRemoteCover, concurrency = CONCURRENCY }) {
  const missing = new Set();
  const reading = new Map(); // nombre → promesa: la misma carátula no se descarga dos veces a la vez
  const waiting = [];
  let active = 0;

  async function limited(task) {
    if (active >= concurrency) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  async function download(record, name) {
    const storage = getStorage();
    if (!storage) throw new Error('Sin conexión con el almacenamiento');
    const picture = await limited(() => read(storage, record));
    if (!picture?.data?.length) {
      missing.add(name);
      return null;
    }
    await files.write(`covers/${name}`, picture.data).catch(() => {});
    return { format: imageFormat(picture.data), data: picture.data };
  }

  return {
    /** Carátula incrustada de un registro ({ format, data }) o null si no tiene. Lanza si no se pudo leer. */
    async get(record) {
      if (!record?.hasCover) return null;
      const name = coverFileName(record);
      const saved = await files.read(`covers/${name}`);
      if (saved?.length) return { format: imageFormat(saved), data: saved };
      if (missing.has(name)) return null;
      if (!reading.has(name)) {
        reading.set(
          name,
          download(record, name).finally(() => reading.delete(name)),
        );
      }
      return reading.get(name);
    },

    /** Guarda la carátula ya leída de un registro (la sincronización, sin descargarla otra vez). Devuelve el nombre. */
    async save(record, picture) {
      const name = coverFileName({ ...record, hasCover: true });
      await files.write(`covers/${name}`, picture.data);
      return name;
    },
  };
}
