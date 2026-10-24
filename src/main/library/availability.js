import { stat } from 'node:fs/promises';
import { toTrack } from './tracks.js';

const MIN_INTERVAL_MS = 15_000; // como mucho una comprobación completa cada 15 s (al volver a la ventana)
const VERIFY_TIMEOUT_MS = 2000; // una unidad de red caída puede tardar mucho en responder
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // ausente 30 días → se olvida
const CONCURRENCY = 16;

/** El archivo se dio por desaparecido (la pista se oculta hasta que vuelva). */
export function isMissing(record) {
  return record.missingSince != null;
}

/** false solo si el archivo (o su carpeta) ya no existe; ante otros errores se da por disponible. */
export async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    return !['ENOENT', 'ENOTDIR'].includes(error.code);
  }
}

/**
 * Vigila que los archivos de la biblioteca sigan en el disco. Los que faltan no se borran:
 * se marcan con `missingSince` y se ocultan, así reaparecen si vuelven (p. ej. al reconectar
 * un disco USB). Tras 30 días ausentes se olvidan.
 */
export function createAvailabilityMonitor({
  store,
  onChange,
  exists = fileExists,
  now = Date.now,
  timers = globalThis,
  minInterval = MIN_INTERVAL_MS,
  verifyTimeout = VERIFY_TIMEOUT_MS,
  purgeAfter = PURGE_AFTER_MS,
}) {
  let running = null;
  let lastCheckAt = Number.NEGATIVE_INFINITY;

  async function runCheck() {
    const time = now();
    const removed = [];
    const restored = [];
    const purged = [];
    await forEachLimit(store.all(), CONCURRENCY, async (record) => {
      const available = await exists(record.path);
      if (available && isMissing(record)) restored.push(withoutMissing(record));
      else if (!available && !isMissing(record)) removed.push({ ...record, missingSince: time });
      else if (!available && time - record.missingSince > purgeAfter) purged.push(record.path);
    });
    store.add([...removed, ...restored]);
    store.remove(purged);
    if (removed.length + restored.length + purged.length > 0) await store.save();
    lastCheckAt = now();
    const change = { removed: removed.map((record) => record.path), restored: restored.map(toTrack) };
    if (change.removed.length + change.restored.length > 0) onChange(change);
    return change;
  }

  async function mark(record, available) {
    if (available !== isMissing(record)) return;
    store.add([available ? withoutMissing(record) : { ...record, missingSince: now() }]);
    await store.save();
  }

  return {
    /** Comprobación completa. Si ya hay una en marcha, devuelve esa. */
    check() {
      running ??= runCheck().finally(() => {
        running = null;
      });
      return running;
    },

    /** Comprobación completa si ha pasado un rato desde la última (p. ej. al volver a la ventana). */
    checkSoon() {
      if (now() - lastCheckAt < minInterval) return;
      this.check().catch((error) => console.warn('[library] no se pudo comprobar la biblioteca', error));
    },

    /** ¿Sigue en el disco? Si no, se marca como ausente. Si tarda demasiado, se da por disponible. */
    async verify(filePath) {
      const record = store.get(filePath);
      if (!record) return false;
      const available = await withTimeout(exists(filePath), verifyTimeout, true, timers);
      await mark(record, available);
      return available;
    },
  };
}

function withoutMissing({ missingSince, ...record }) {
  return record;
}

async function forEachLimit(items, limit, task) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function withTimeout(promise, ms, fallback, timers) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = timers.setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => timers.clearTimeout(timer));
}
