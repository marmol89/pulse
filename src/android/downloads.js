import { extname } from '../backend/paths.js';
import { fingerprint } from './covers.js';

const FILE = 'downloads.json';
const FOLDER = 'downloads';

/**
 * Canciones descargadas para escucharlas sin conexión (solo Android): se bajan de una en una desde su URL
 * firmada a downloads/ (`download(url, ruta)`, Filesystem.downloadFile: va al disco sin pasar por el JS) y se
 * apuntan en downloads.json (`{ id: { file, etag, size } }`). `urlFor(record)` da la local si sigue siendo el mismo
 * objeto (mismo ETag); si cambió en el bucket, se vuelve a escuchar desde S3 hasta que se descargue otra vez.
 * `onChange(summary)` avisa al terminar cada una.
 *
 * @param {{ files, download: (url: string, path: string) => Promise<void>, signedUrl: (record) => Promise<string>,
 *   getRecord: (id: string) => object | null, toUrl: (path: string) => string, onChange: (summary) => void }} options
 */
export function createDownloads({ files, download, signedUrl, getRecord, toUrl, onChange = () => {} }) {
  const entries = new Map();
  const pending = new Set();
  let working = null;

  const fileFor = (record) => `${fingerprint(`${record.path}#${record.etag ?? ''}`)}${extname(record.key ?? record.path).toLowerCase()}`;
  const isCurrent = (id) => {
    const entry = entries.get(id);
    return Boolean(entry) && entry.etag === (getRecord(id)?.etag ?? entry.etag);
  };

  async function save() {
    await files.write(FILE, JSON.stringify(Object.fromEntries(entries)));
  }

  async function work() {
    while (pending.size > 0) {
      const [id] = pending;
      const record = getRecord(id);
      try {
        if (record) {
          const file = fileFor(record);
          await download(await signedUrl(record), `${FOLDER}/${file}`);
          if (!pending.has(id)) {
            await files.remove(`${FOLDER}/${file}`); // se quitó mientras se descargaba
            continue;
          }
          const previous = entries.get(id);
          entries.set(id, { file, etag: record.etag ?? '', size: record.size ?? 0 });
          if (previous && previous.file !== file) await files.remove(`${FOLDER}/${previous.file}`);
          await save();
        }
      } catch (error) {
        console.warn('[descargas] no se pudo descargar', id, error);
      }
      pending.delete(id);
      onChange(summary());
    }
    working = null;
  }

  function summary() {
    const done = [...entries.keys()].filter(isCurrent);
    return {
      paths: done,
      pending: [...pending],
      bytes: done.reduce((total, id) => total + (entries.get(id).size || 0), 0),
    };
  }

  async function forget(ids) {
    let changed = false;
    for (const id of ids) {
      pending.delete(id);
      const entry = entries.get(id);
      if (!entry) continue;
      entries.delete(id);
      await files.remove(`${FOLDER}/${entry.file}`);
      changed = true;
    }
    if (changed) await save();
    return summary();
  }

  return {
    async load() {
      try {
        const saved = JSON.parse((await files.readText(FILE)) ?? '{}');
        for (const [id, entry] of Object.entries(saved ?? {})) if (entry?.file) entries.set(id, entry);
      } catch {
        // dañado: las canciones se vuelven a escuchar desde el bucket
      }
    },

    /** URL local de la canción descargada (y al día), o null. */
    urlFor(record) {
      return record && isCurrent(record.path) ? toUrl(`${FOLDER}/${entries.get(record.path).file}`) : null;
    },

    /** Pone en cola las que no están descargadas (o cambiaron en el bucket). */
    add(ids) {
      for (const id of ids) if (typeof id === 'string' && getRecord(id) && !isCurrent(id)) pending.add(id);
      working ??= work();
      return summary();
    },

    remove: (ids) => forget(ids.filter((id) => typeof id === 'string')),
    clear: () => forget([...new Set([...entries.keys(), ...pending])]),
    summary,

    /** Espera a que terminen las descargas en curso (tests). */
    async idle() {
      while (working) await working;
    },
  };
}
