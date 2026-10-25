import { parseTrackId } from './remote.js';
import { freeKey } from './upload.js';
import { describeDeleteError, TRASH_FOLDER } from '../s3/storage.js';

const NO_CONNECTION = { ok: false, error: 'Conecta tu bucket para eliminar o restaurar canciones' };

/**
 * Papelera del bucket: "Eliminar del bucket" mueve la canción a papelera/ (bajo la carpeta de la conexión:
 * copia y borra el original) y la quita de la biblioteca; desaparece en todos los Pulse en su próxima
 * sincronización. Restaurar la devuelve a su sitio y sincroniza; vaciar la papelera es lo único que borra
 * para siempre. Nunca pisa nada: si el nombre ya está ocupado, "Nombre (2).mp3".
 * Las listas y los favoritos no se tocan: al restaurarla, la canción vuelve a estar en ellos.
 * `onRemoved(ids)`: canciones que han dejado la biblioteca (p. ej. para quitar su descarga del móvil).
 */
export function createTrash({ getStorage, store, afterRestore = async () => {}, onRemoved = () => {} }) {
  const trashPrefix = (storage) => `${storage.prefix}${TRASH_FOLDER}`;

  async function attempt(task) {
    const storage = getStorage();
    if (!storage) return NO_CONNECTION;
    try {
      return await task(storage);
    } catch (error) {
      return { ok: false, error: describeDeleteError(error) };
    }
  }

  async function list(storage) {
    const prefix = trashPrefix(storage);
    const objects = await storage.listAudio({ trash: true });
    return objects
      .map((object) => ({ key: object.key, name: object.key.slice(prefix.length), size: object.size, deletedAt: object.lastModified }))
      .sort((a, b) => b.deletedAt - a.deletedAt || a.name.localeCompare(b.name));
  }

  return {
    /** @returns {Promise<{ ok: true, removed: string[] } | { ok: false, error: string }>} */
    move: (id) =>
      attempt(async (storage) => {
        const target = parseTrackId(id);
        if (!store.has(id) || target?.bucket !== storage.bucket || !target.key.startsWith(storage.prefix)) {
          return { ok: false, error: 'Esa canción no está en tu bucket' };
        }
        const key = await freeKey(storage, `${trashPrefix(storage)}${target.key.slice(storage.prefix.length)}`, -1);
        await storage.copy(target.key, key);
        await storage.remove(target.key);
        store.remove([id]);
        await store.save();
        onRemoved([id]);
        return { ok: true, removed: [id] };
      }),

    /** Lo que hay en la papelera, lo último eliminado primero. */
    list: () => attempt(async (storage) => ({ ok: true, items: await list(storage) })),

    /** Devuelve una canción a su carpeta (si ya hay otra igual, solo la quita de la papelera). */
    restore: (key) =>
      attempt(async (storage) => {
        const prefix = trashPrefix(storage);
        const found = typeof key === 'string' && key.startsWith(prefix) ? await storage.stat(key) : null;
        if (!found) return { ok: false, error: 'Esa canción ya no está en la papelera' };
        const destination = await freeKey(storage, `${storage.prefix}${key.slice(prefix.length)}`, found.size);
        if (destination !== null) await storage.copy(key, destination);
        await storage.remove(key);
        await afterRestore().catch((error) => console.warn('[papelera] no se pudo sincronizar tras restaurar', error));
        return { ok: true, items: await list(storage) };
      }),

    /** Borra para siempre todo lo que hay en la papelera. */
    empty: () =>
      attempt(async (storage) => {
        const items = await list(storage);
        for (const item of items) await storage.remove(item.key);
        return { ok: true, removed: items.length, items: [] };
      }),
  };
}
