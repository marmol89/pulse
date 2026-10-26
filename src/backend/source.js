/** Las carpetas del equipo y si se usan en vez del bucket (en los archivos de la app: `files`). */
export const FOLDERS_FILE = 'local.json';
const VERSION = 1;

const cleanFolder = (folder) =>
  typeof folder?.id === 'string' && folder.id ? { id: folder.id, name: typeof folder.name === 'string' && folder.name ? folder.name : folder.id } : null;

/**
 * De dónde sale la música: el bucket S3 (`s3`, el servicio de s3/service.js) o carpetas del equipo, nunca las dos
 * a la vez. Conectar el bucket deja de usar las carpetas y usar las carpetas deja de usar el bucket, pero los dos
 * se quedan guardados para volver. Las carpetas son de solo lectura (`createFolderStorage(carpetas)`, de cada
 * plataforma: un storage con `readOnly`).
 *
 * Una carpeta es { id, name }: la ruta en el ordenador o la URI que da Android, y lo que ve el usuario. Solo se
 * aceptan las que eligió el usuario (`offer()`, desde el selector del sistema) o las que ya estaban guardadas:
 * la ventana no puede pedir que se lea una carpeta cualquiera. `release(carpeta)` se llama al quitar una (en
 * Android, para devolver el permiso de lectura).
 */
export function createSourceService({ s3, files, createFolderStorage, release = async () => {} }) {
  let saved = { active: false, folders: [] };
  let folderStorage = null;
  const offered = new Map();

  function open() {
    folderStorage?.destroy?.();
    folderStorage = saved.active && saved.folders.length > 0 ? createFolderStorage(saved.folders) : null;
  }

  async function write(next) {
    await files.write(FOLDERS_FILE, JSON.stringify({ version: VERSION, ...next }));
    saved = next;
    open();
  }

  /** Tras conectar el bucket (con el formulario o un credentials.json), se deja de usar las carpetas. */
  async function afterConnect(result) {
    if (!result.ok) return result;
    if (saved.active) await write({ ...saved, active: false });
    return { ...result, summary: service.summary() };
  }

  const service = {
    async load() {
      await s3.load();
      try {
        const data = JSON.parse((await files.readText(FOLDERS_FILE)) ?? '{}');
        saved = { active: data.active === true, folders: (Array.isArray(data.folders) ? data.folders : []).map(cleanFolder).filter(Boolean) };
      } catch (error) {
        console.warn('[carpetas] no se pudo leer local.json', error);
      }
      open();
    },

    /** Storage de la música: el de las carpetas o el del bucket (null si aún no hay ninguno). */
    storage: () => (saved.active ? folderStorage : s3.storage()),

    /**
     * Lo que ve la ventana: `mode` ('s3' o 'local'), la conexión del bucket sin la clave secreta (si la hay) y
     * las carpetas guardadas (aunque se use el bucket, para el formulario). null si no hay nada todavía.
     */
    summary() {
      const bucket = s3.summary();
      if (!saved.active && !bucket) return null;
      return { mode: saved.active ? 'local' : 's3', ...bucket, folders: saved.folders };
    },

    connect: async (input) => afterConnect(await s3.connect(input)),
    importCredentials: async (text) => afterConnect(await s3.importCredentials(text)),

    /** Carpeta elegida en el selector del sistema: desde ahora se puede usar. Devuelve { id, name } o null. */
    offer(folder) {
      const clean = cleanFolder(folder);
      if (clean) offered.set(clean.id, clean);
      return clean;
    },

    /**
     * Usa estas carpetas (sus ids, en orden) en vez del bucket. Antes comprueba que se pueden leer.
     * @returns {Promise<{ ok: true, summary, count } | { ok: false, error }>}
     */
    async useFolders(ids) {
      const known = new Map([...saved.folders.map((folder) => [folder.id, folder]), ...offered]);
      const folders = [...new Set(Array.isArray(ids) ? ids : [])].map((id) => known.get(id)).filter(Boolean);
      if (folders.length === 0) return { ok: false, error: 'Añade al menos una carpeta con música' };
      const probe = createFolderStorage(folders);
      let count;
      try {
        count = (await probe.listAudio()).length;
      } catch (error) {
        return { ok: false, error: error instanceof TypeError ? error.message : 'No se pudieron leer las carpetas' };
      } finally {
        probe.destroy?.();
      }
      const removed = saved.folders.filter((folder) => !folders.some((kept) => kept.id === folder.id));
      await write({ active: true, folders });
      for (const folder of removed) await release(folder).catch(() => {});
      return { ok: true, summary: service.summary(), count };
    },
  };
  return service;
}
