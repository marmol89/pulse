import { createSharedRecords, mergeRecords, resultOf } from './shared.js';
import { isTrackId } from './remote.js';

/** Caché local (en los archivos de la app) y copia compartida en el bucket, bajo la carpeta de la conexión. */
export const FAVORITES_FILE = 'favorites.json';
const REMOTE_FILE = 'favoritos.json';
const MAX_IMPORT = 20_000;

const valid = (record) => isTrackId(record?.id) && typeof record.createdAt === 'number' && typeof record.updatedAt === 'number';

/** Resultado para la interfaz: { ok: true, favorites } o { ok: false, error } con el motivo en español. */
export const favoriteResult = resultOf('favorites');

/**
 * Canciones favoritas (el corazón ♥), compartidas por todos los Pulse conectados al mismo bucket
 * (metadatos/favoritos.json). Un registro por canción: { id: ruta, createdAt: cuándo se marcó, updatedAt },
 * con `deleted` si se desmarcó (para que la copia de otro equipo no la vuelva a marcar).
 * `all()` y las operaciones devuelven las rutas, las marcadas más recientemente primero.
 */
export function createFavoriteStore({ now = Date.now, onChange = () => {}, ...deps }) {
  const newestFirst = (paths) => paths.reverse();
  const records = createSharedRecords({
    ...deps,
    now,
    onChange: (paths) => onChange(newestFirst(paths)),
    key: 'favorites',
    localFile: FAVORITES_FILE,
    remoteFile: REMOTE_FILE,
    tag: 'favoritos',
    label: 'los favoritos',
    offlineMessage: 'Conecta tu bucket para guardar favoritos',
    valid,
    show: (record) => record.id,
  });

  return {
    load: records.load,

    all: () => newestFirst(records.all()),

    /** Marca (`favorite`) o desmarca una canción. */
    async set(path, favorite) {
      if (!isTrackId(path)) throw new TypeError('Esa canción no está en tu biblioteca');
      const paths = await records.update((favorites) => {
        const mine = favorites.find((record) => record.id === path);
        if (Boolean(mine && !mine.deleted) === favorite) return favorites;
        const at = Math.max(now(), (mine?.updatedAt ?? 0) + 1);
        const record = favorite ? { id: path, createdAt: at, updatedAt: at } : { id: path, createdAt: mine.createdAt, updatedAt: at, deleted: true };
        return [...favorites.filter((item) => item !== mine), record];
      });
      return newestFirst(paths);
    },

    /**
     * Favoritos de cuando solo se guardaban en este equipo (de la más antigua a la más reciente): se añaden
     * los que no se hayan marcado ni desmarcado ya en el bucket, conservando su orden.
     */
    async import(paths) {
      const fresh = [...new Set(Array.isArray(paths) ? paths.filter(isTrackId) : [])].slice(-MAX_IMPORT);
      const result = await records.update((favorites) => {
        const known = new Set(favorites.map((record) => record.id));
        const added = fresh.filter((path) => !known.has(path));
        if (added.length === 0) return favorites;
        const at = now() - added.length;
        return mergeRecords(favorites, added.map((path, index) => ({ id: path, createdAt: at + index + 1, updatedAt: at + index + 1 })));
      });
      return newestFirst(result);
    },

    sync: records.sync,
    syncSoon: records.syncSoon,
    hasPending: records.hasPending,
  };
}
