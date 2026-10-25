import { createSharedRecords, mergeRecords, resultOf } from './shared.js';

/** Caché local (en los archivos de la app) y copia compartida en el bucket, bajo la carpeta de la conexión. */
export const RECENTS_FILE = 'recents.json';
const REMOTE_FILE = 'recientes.json';
const KEEP = 100; // registros que se guardan
const SHOW = 12; // los que ve la interfaz ("Escuchado recientemente")

const isTrack = (path) => typeof path === 'string' && path.startsWith('s3://');
const valid = (record) => isTrack(record?.id) && typeof record.createdAt === 'number' && typeof record.updatedAt === 'number';

/** Resultado para la interfaz: { ok: true, recents } o { ok: false, error } con el motivo en español. */
export const recentResult = resultOf('recents');

/**
 * "Escuchado recientemente", compartido por todos los Pulse conectados al mismo bucket (metadatos/recientes.json).
 * Un registro por canción con la última vez que sonó (createdAt = updatedAt = ese momento): al juntar copias gana
 * la escucha más reciente de cada una. `all()` y las operaciones devuelven las rutas, la última que sonó primero.
 */
export function createRecentStore({ now = Date.now, onChange = () => {}, ...deps }) {
  const newestFirst = (paths) => paths.reverse().slice(0, SHOW);
  const records = createSharedRecords({
    ...deps,
    now,
    onChange: (paths) => onChange(newestFirst(paths)),
    key: 'recents',
    localFile: RECENTS_FILE,
    remoteFile: REMOTE_FILE,
    tag: 'recientes',
    label: 'los recientes',
    offlineMessage: 'Conecta tu bucket para guardar lo que escuchas',
    valid,
    show: (record) => record.id,
  });
  const latest = (list) => list.slice(-KEEP);

  return {
    load: records.load,

    all: () => newestFirst(records.all()),

    /** Ha empezado a sonar una canción: pasa a ser la más reciente. */
    async add(path) {
      if (!isTrack(path)) throw new TypeError('Esa canción no está en tu bucket');
      const paths = await records.update((recents) => {
        const mine = recents.find((record) => record.id === path);
        const at = Math.max(now(), ...recents.map((record) => record.updatedAt + 1));
        if (mine && mine === recents.at(-1)) return recents; // ya era la última
        return latest([...recents.filter((record) => record !== mine), { id: path, createdAt: at, updatedAt: at }]);
      });
      return newestFirst(paths);
    },

    /** Recientes de cuando solo se guardaban en este equipo (de la más antigua a la más reciente): los que falten. */
    async import(paths) {
      const fresh = [...new Set(Array.isArray(paths) ? paths.filter(isTrack) : [])].slice(-KEEP);
      const result = await records.update((recents) => {
        const known = new Set(recents.map((record) => record.id));
        const added = fresh.filter((path) => !known.has(path));
        if (added.length === 0) return recents;
        // Más antiguas que cualquier escucha ya guardada: lo del bucket es más reciente que lo de este equipo.
        const first = Math.min(now(), ...recents.map((record) => record.createdAt)) - added.length - 1;
        return latest(mergeRecords(recents, added.map((path, index) => ({ id: path, createdAt: first + index, updatedAt: first + index }))));
      });
      return newestFirst(result);
    },

    sync: records.sync,
    syncSoon: records.syncSoon,
    hasPending: records.hasPending,
  };
}
