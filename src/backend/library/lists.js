import { createSharedRecords, mergeRecords, resultOf } from './shared.js';

/** Caché local (en los archivos de la app) y copia compartida en el bucket, bajo la carpeta de la conexión. */
export const LISTS_FILE = 'lists.json';
const REMOTE_FILE = 'listas.json';
const MAX_NAME = 100;
const MAX_TRACKS = 5_000;

/** Id aleatorio con getRandomValues (randomUUID pide un contexto seguro que el WebView no siempre da). */
function randomId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Dos copias de las listas → una: por cada lista gana la editada más tarde (`updatedAt`; si empatan, `a`).
 * Las borradas se quedan como marca (`deleted`) para que otra copia no las resucite.
 */
export const mergeLists = mergeRecords;

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
  if (!text) throw new TypeError('Ponle un nombre a la lista');
  return text;
}

function cleanPaths(paths) {
  return Array.isArray(paths) ? [...new Set(paths.filter((path) => typeof path === 'string' && path.startsWith('s3://')))] : [];
}

/**
 * Resultado de una operación para la interfaz: { ok: true, lists, id? } o, si el usuario pidió algo que no
 * se puede (nombre vacío, lista borrada, sin conexión), { ok: false, error } con el mensaje en español.
 */
export const listResult = resultOf('lists');

const valid = (list) => typeof list?.id === 'string' && typeof list.updatedAt === 'number' && (list.deleted || (typeof list.name === 'string' && Array.isArray(list.tracks)));

/**
 * Listas de canciones creadas por el usuario, compartidas por todos los Pulse conectados al mismo bucket
 * (metadatos/listas.json). Cada cambio se guarda al momento en este equipo y se sube poco después;
 * `sync()` (al arrancar, al volver a la app y con "Actualizar biblioteca") trae lo de los demás y
 * avisa con `onChange(listas)`. Cada lista: { id, name, tracks: id[], createdAt, updatedAt }.
 */
export function createListStore({ now = Date.now, newId = randomId, ...deps }) {
  const records = createSharedRecords({
    ...deps,
    now,
    key: 'lists',
    localFile: LISTS_FILE,
    remoteFile: REMOTE_FILE,
    tag: 'listas',
    label: 'las listas',
    offlineMessage: 'Conecta tu bucket para usar las listas',
    valid,
    show: ({ id, name, tracks, createdAt, updatedAt }) => ({ id, name, tracks: [...tracks], createdAt, updatedAt }),
  });

  function change(id, update) {
    return records.update((lists) => {
      const list = lists.find((item) => item.id === id && !item.deleted);
      if (!list) throw new TypeError('Esa lista ya no existe');
      return lists.map((item) => (item === list ? { ...update(list), updatedAt: Math.max(now(), list.updatedAt + 1) } : item));
    });
  }

  return {
    load: records.load,

    /** Listas de la conexión actual ([] sin conexión), en orden de creación. */
    all: records.all,

    /** Crea una lista (con canciones, si se dan). @returns {Promise<{ id: string, lists: object[] }>} */
    async create(name, paths = []) {
      const at = now();
      const list = { id: newId(), name: cleanName(name), tracks: cleanPaths(paths).slice(0, MAX_TRACKS), createdAt: at, updatedAt: at };
      return { id: list.id, lists: await records.update((lists) => [...lists, list]) };
    },

    rename(id, name) {
      const text = cleanName(name);
      return change(id, (list) => ({ ...list, name: text }));
    },

    /** Añade al final las que no estén ya. */
    add(id, paths) {
      return change(id, (list) => ({ ...list, tracks: [...new Set([...list.tracks, ...cleanPaths(paths)])].slice(0, MAX_TRACKS) }));
    },

    /** Mueve una canción de la lista a la posición `to` (0 = la primera). */
    moveTrack(id, path, to) {
      return change(id, (list) => {
        const tracks = list.tracks.filter((track) => track !== path);
        if (tracks.length === list.tracks.length) throw new TypeError('Esa canción ya no está en la lista');
        const at = Math.min(Math.max(Math.trunc(Number(to)) || 0, 0), tracks.length);
        tracks.splice(at, 0, path);
        return { ...list, tracks };
      });
    },

    removeTrack(id, path) {
      return change(id, (list) => ({ ...list, tracks: list.tracks.filter((track) => track !== path) }));
    },

    remove(id) {
      return change(id, ({ id: listId, createdAt }) => ({ id: listId, createdAt, deleted: true }));
    },

    sync: records.sync,
    syncSoon: records.syncSoon,
    hasPending: records.hasPending,
  };
}
