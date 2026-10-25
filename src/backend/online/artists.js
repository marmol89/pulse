import { coverFile } from '../paths.js';
import { UNKNOWN_ARTIST } from '../library/tracks.js';
import { TransientError } from './http.js';
import { findArtistPicture } from './deezer.js';
import { saveImage } from './images.js';

const FILE = 'artists.json';
const INTERVAL_MS = 1500; // Deezer admite ~50 peticiones cada 5 s: muy por debajo
const RETRY_DELAY_MS = 60_000; // sin red o servicio ocupado
const FLUSH_EVERY = 12; // avisa a la ventana cada tantas fotos (y al terminar)

/**
 * Fotos de artista de Deezer, guardadas en covers/ como las carátulas de internet y apuntadas en
 * artists.json (`{ nombre: { coverName, checkedAt } }`; coverName null: Deezer no tiene foto de ese artista).
 * La ventana pide los nombres que ve (`request`): devuelve las que ya hay y busca el resto en segundo plano,
 * de uno en uno y solo con "Datos de internet" activado. `onUpdated({ nombre: coverName })` avisa de las nuevas.
 */
export function createArtistPictures({ files, http, onUpdated, timers = globalThis, now = Date.now, interval = INTERVAL_MS, retryDelay = RETRY_DELAY_MS }) {
  const known = new Map();
  const pending = new Set();
  const found = new Map();
  let enabled = false;
  let timer = null;

  function schedule(delay) {
    if (!enabled || timer || pending.size === 0) return;
    timer = timers.setTimeout(() => {
      timer = null;
      processNext();
    }, delay);
  }

  async function processNext() {
    const [name] = pending;
    if (!enabled || name === undefined) return;
    try {
      const url = await findArtistPicture(http, name);
      const coverName = url ? await saveImage({ http, files }, url, { isTransient: (error) => error instanceof TransientError }) : null;
      pending.delete(name);
      known.set(name, { coverName, checkedAt: now() });
      await files.write(FILE, JSON.stringify(Object.fromEntries(known)));
      if (coverName) found.set(name, coverName);
      if (found.size >= FLUSH_EVERY || pending.size === 0) flush();
      schedule(interval);
    } catch (error) {
      if (!(error instanceof TransientError)) pending.delete(name); // respuesta rara: no insistir con ese
      flush();
      schedule(error instanceof TransientError ? retryDelay : interval);
    }
  }

  function flush() {
    if (found.size === 0) return;
    const pictures = Object.fromEntries(found);
    found.clear();
    onUpdated(pictures);
  }

  return {
    async load() {
      try {
        const saved = JSON.parse((await files.readText(FILE)) ?? '{}');
        for (const [name, entry] of Object.entries(saved ?? {})) if (entry && typeof entry === 'object') known.set(name, entry);
      } catch {
        // primera vez o archivo dañado: se vuelven a buscar
      }
    },

    /** Fotos ya guardadas de esos artistas ({ nombre: coverName }); los que no se han buscado quedan en cola. */
    request(names) {
      const pictures = {};
      for (const name of new Set(names)) {
        if (typeof name !== 'string' || !name.trim() || name === UNKNOWN_ARTIST) continue;
        const entry = known.get(name);
        if (entry?.coverName) pictures[name] = entry.coverName;
        else if (!entry) pending.add(name);
      }
      schedule(0);
      return pictures;
    },

    /** ¿Es la foto de algún artista? (el protocolo solo sirve esas). */
    isPicture(coverName) {
      for (const entry of known.values()) if (entry.coverName === coverName) return true;
      return false;
    },

    /** La imagen de una foto de artista, o null si no es una de ellas o ya no está. */
    async read(coverName) {
      if (!this.isPicture(coverName)) return null;
      return files.read(coverFile(coverName)).catch(() => null);
    },

    setEnabled(value) {
      enabled = value === true;
      if (enabled) schedule(0);
      else if (timer) {
        timers.clearTimeout(timer);
        timer = null;
      }
      return enabled;
    },
  };
}
