import { basename } from '../backend/paths.js';
import { coverFileName } from '../backend/library/covers.js';

export { coverFileName, fingerprint } from '../backend/library/covers.js';

const BATCH_MS = 1500; // agrupa los avisos de carátulas listas

/**
 * Carátulas en Android: en vez del protocolo media://, archivos de covers/ que el WebView carga
 * directamente (`toUrl(nombre)`, con Capacitor.convertFileSrc). La que aún no está en el móvil se
 * descarga en segundo plano, de una en una (la incrustada leyendo el principio del objeto; la de
 * internet de la caché o de metadatos/caratulas/), y `onReady(ids)` avisa para repintar esas pistas.
 *
 * @param {{ files, toUrl: (name: string) => string, readEmbedded: (record) => Promise<{ data: Uint8Array } | null>,
 *   readCover: (name: string) => Promise<Uint8Array | null>, getRecord: (id: string) => object | null, onReady: (ids: string[]) => void }} options
 */
export function createCoverCache({ files, toUrl, readEmbedded, readCover, getRecord, onReady, batchMs = BATCH_MS, timers = globalThis }) {
  const present = new Set();
  const failed = new Set(); // no la tiene: no se reintenta en esta sesión
  const pending = new Map(); // nombre → id de la pista que la pidió
  const ready = new Set();
  let working = null;
  let batchTimer = null;

  async function fetchOne(name, id) {
    const record = getRecord(id);
    if (!record || coverFileName(record) !== name) return false;
    if (record.hasCover) {
      const picture = await readEmbedded(record);
      if (!picture?.data?.length) return false;
      await files.write(`covers/${name}`, picture.data);
      return true;
    }
    // readCover la deja en covers/ (de la caché o descargada del bucket).
    return Boolean((await readCover(name))?.length);
  }

  async function work() {
    while (pending.size > 0) {
      const [name, id] = pending.entries().next().value;
      // Un fallo de red no cuenta como "no la tiene": se vuelve a pedir la próxima vez que se pinte.
      const ok = await fetchOne(name, id).catch(() => null);
      pending.delete(name); // hasta aquí sigue "pedida": no se descarga dos veces
      if (!ok) {
        if (ok === false) failed.add(name);
        continue;
      }
      present.add(name);
      ready.add(id);
      batchTimer ??= timers.setTimeout(flush, batchMs);
    }
    working = null;
  }

  function flush() {
    batchTimer = null;
    const ids = [...ready];
    ready.clear();
    if (ids.length > 0) onReady(ids);
  }

  return {
    /** Lo que ya hay en covers/ (al arrancar). */
    async load() {
      for (const name of await files.list('covers')) if (!name.endsWith('.tmp')) present.add(name);
    },

    /** URL de la carátula si ya está en el móvil; si no, null y se pide en segundo plano. */
    url(record) {
      const name = coverFileName(record);
      if (!name) return null;
      if (present.has(name)) return toUrl(name);
      if (!failed.has(name) && !pending.has(name)) {
        pending.set(name, record.path);
        working ??= work();
      }
      return null;
    },

    /** Una carátula recién guardada en covers/ (la de internet tras una búsqueda). */
    markPresent(name) {
      if (name) present.add(basename(name));
    },

    /** Espera a que termine lo pendiente (tests y antes de cerrar). */
    async idle() {
      while (working) await working;
      if (batchTimer) {
        timers.clearTimeout(batchTimer);
        flush();
      }
    },
  };
}
