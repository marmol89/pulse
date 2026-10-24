import { toTrack } from '../library/tracks.js';
import { TransientError } from './http.js';
import { needsInfo } from './enricher.js';

const INTERVAL_MS = 3500; // ≈ 17 búsquedas por minuto: por debajo del límite de iTunes (~20)
const START_DELAY_MS = 10_000; // no competir con el arranque de la app
const RETRY_DELAY_MS = 60_000; // sin red o servicio ocupado
const FLUSH_DELAY_MS = 3000; // agrupa los cambios antes de avisar a la ventana

/**
 * Completa la biblioteca con datos de internet en segundo plano, una pista cada vez,
 * y atiende al momento las búsquedas de la pista que suena o que pide el usuario.
 * Todas las búsquedas van en fila: nunca hay dos a la vez.
 */
export function createEnrichmentQueue({
  store,
  enricher,
  onUpdated,
  timers = globalThis,
  now = Date.now,
  interval = INTERVAL_MS,
  startDelay = START_DELAY_MS,
  retryDelay = RETRY_DELAY_MS,
  flushDelay = FLUSH_DELAY_MS,
}) {
  let enabled = false;
  let timer = null;
  let flushTimer = null;
  let chain = Promise.resolve();
  const updates = new Map();

  function exclusive(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  function schedule(delay) {
    if (!enabled || timer) return;
    timer = timers.setTimeout(() => {
      timer = null;
      exclusive(processNext);
    }, delay);
  }

  async function processNext() {
    if (!enabled) return;
    const record = store.all().find(needsInfo);
    if (!record) return; // al día: wake() la reanuda cuando haya pistas nuevas
    try {
      const { record: updated, changed } = await enricher.enrich(record);
      if (changed) remember(updated);
      schedule(interval);
    } catch (error) {
      if (error instanceof TransientError) {
        schedule(retryDelay);
        return;
      }
      // Error inesperado con esta pista: se marca para no atascar la cola en ella.
      console.warn('[online] no se pudo completar', record.path, error);
      remember({ ...record, online: { ...record.online, checkedAt: now(), status: 'error' } });
      schedule(interval);
    }
  }

  function remember(record) {
    store.add([record]);
    updates.set(record.path, record);
    if (!flushTimer) flushTimer = timers.setTimeout(flush, flushDelay);
  }

  async function flush() {
    flushTimer = null;
    const records = [...updates.values()];
    updates.clear();
    if (records.length === 0) return;
    await store.save();
    onUpdated(records.map(toTrack));
  }

  return {
    setEnabled(value) {
      enabled = Boolean(value);
      if (enabled) {
        schedule(startDelay);
      } else {
        timers.clearTimeout(timer);
        timer = null;
      }
    },

    /** Hay pistas nuevas (tras importar): reanudar si estaba al día. */
    wake() {
      schedule(interval);
    },

    /**
     * Búsqueda inmediata. Sin conexión o con un servicio caído un momento no lanza (cruzaría el IPC
     * como error): devuelve la pista sin cambios con `unavailable: true`.
     * @returns {Promise<{ track: object, changed: boolean, unavailable?: true } | null>}
     */
    lookupNow(filePath, options = {}) {
      return exclusive(async () => {
        const record = store.get(filePath);
        if (!record) return null;
        let result;
        try {
          result = await enricher.enrich(record, options);
        } catch (error) {
          if (error instanceof TransientError) return { track: toTrack(record), changed: false, unavailable: true };
          throw error;
        }
        const { record: updated, changed } = result;
        if (changed) {
          store.add([updated]);
          await store.save();
        }
        return { track: toTrack(updated), changed };
      });
    },
  };
}
