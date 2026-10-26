import { createListStore } from './lists.js';
import { createFavoriteStore } from './favorites.js';
import { createRecentStore } from './recents.js';
import { createPlayStore, deviceId } from './plays.js';

/** Lo que el usuario guarda en el bucket además de las canciones; `onChange(tipo, todos)` usa estos nombres. */
export const USER_DATA_KINDS = ['lists', 'favorites', 'recents', 'plays'];

/**
 * Listas, favoritos, recientes y escuchas (cada uno en su archivo de este equipo y en metadatos/ del bucket),
 * creados y cargados igual en Electron y en Android. Se sincronizan juntos: al arrancar, al volver a la app,
 * con "Actualizar biblioteca" y, si queda algo sin subir, antes de cerrar.
 * @param {{ files, getStorage: () => object | null, onChange: (kind: string, all: unknown) => void, timers?: object }} deps
 */
export async function loadUserData({ files, getStorage, onChange, timers }) {
  const deps = (kind) => ({ files, getStorage, timers, onChange: (all) => onChange(kind, all) });
  const stores = {
    lists: createListStore(deps('lists')),
    favorites: createFavoriteStore(deps('favorites')),
    recents: createRecentStore(deps('recents')),
    plays: createPlayStore({ ...deps('plays'), device: await deviceId(files) }),
  };
  const all = Object.values(stores);
  await Promise.all(all.map((store) => store.load()));

  return {
    ...stores,

    /** Trae lo de los demás equipos y sube lo de este. */
    sync: () => Promise.all(all.map((store) => store.sync())),

    /** Sincroniza los que lleven un rato sin hacerlo (al arrancar o al volver a la app). */
    syncSoon() {
      for (const store of all) store.syncSoon();
    },

    /** ¿Queda algo sin subir? */
    hasPending: () => all.some((store) => store.hasPending()),

    /** Sube ya lo que esté pendiente (antes de cerrar o al salir de la app). */
    flush: () => Promise.all(all.filter((store) => store.hasPending()).map((store) => store.sync())),
  };
}
