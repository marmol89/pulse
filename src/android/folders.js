import { isAudioFile } from '../backend/library/tracks.js';

/** Ruta que sirve LocalAudioWebViewClient.java: el audio de las carpetas, con rangos (el <audio> salta con ellos). */
export const LOCAL_AUDIO_PATH = '/_pulse_local_/';

/** URL (del mismo origen que la app) de un documento de una carpeta elegida: su URI content:// codificada. */
export function localAudioUrl(uri) {
  return `${LOCAL_AUDIO_PATH}?uri=${encodeURIComponent(uri)}`;
}

const READ_ONLY = () => Promise.reject(new TypeError('Pulse no modifica las carpetas de tu móvil'));

/**
 * Música de carpetas del móvil con la forma del storage de S3 (como src/main/library/folderStorage.js en
 * Electron). Las carpetas se eligen con el selector del sistema (SAF: el usuario da permiso de lectura a esa
 * carpeta y nada más) y el plugin PulseFolders (FoldersPlugin.java) las recorre. La clave de cada canción es la
 * URI de su documento; su nombre ("Disco/01.mp3") va aparte, en `name`. De solo lectura.
 * Las lecturas van por HTTP al propio WebView (`fetch`), sin pasar bytes en base64 por el puente de Capacitor.
 *
 * @param {Array<{ id: string, name: string }>} folders `id`: URI del árbol (content://…/tree/…)
 * @param {{ plugin: { list: (options: { uri: string }) => Promise<{ files: Array<{ uri, path, size, lastModified }> }> }, fetch: typeof fetch }} deps
 */
export function createAndroidFolderStorage(folders, { plugin, fetch }) {
  async function get(key, range) {
    const response = await fetch(localAudioUrl(key), { headers: { Range: range } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`No se pudo leer la canción (${response.status})`);
    return response;
  }

  return {
    bucket: 'carpetas',
    prefix: '',
    scheme: 'local',
    readOnly: true,

    async listAudio() {
      const objects = new Map();
      for (const folder of folders) {
        let files;
        try {
          ({ files } = await plugin.list({ uri: folder.id }));
        } catch {
          throw new TypeError(`No se puede leer la carpeta «${folder.name}»: vuelve a añadirla en «Conexión»`);
        }
        for (const file of files ?? []) {
          if (!isAudioFile(file.path)) continue;
          const size = Number(file.size) || 0;
          const lastModified = Number(file.lastModified) || 0;
          objects.set(file.uri, { key: file.uri, name: file.path, size, etag: `${size}-${lastModified}`, lastModified });
        }
      }
      return [...objects.values()];
    },

    async readStart(key, bytes) {
      const response = await get(key, `bytes=0-${bytes - 1}`);
      if (!response) throw new Error('La canción ya no está en su carpeta');
      return new Uint8Array(await response.arrayBuffer()).subarray(0, bytes);
    },

    /** En las carpetas no hay metadatos de Pulse que leer. */
    read: async () => null,

    async stat(key) {
      const response = await get(key, 'bytes=0-0');
      if (!response) return null;
      await response.arrayBuffer(); // libera la respuesta
      const total = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1];
      return { size: Number(total ?? response.headers.get('content-length') ?? 0) };
    },

    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    /** URL para el <audio>. */
    urlOf: (key) => localAudioUrl(key),

    upload: READ_ONLY,
    copy: READ_ONLY,
    remove: READ_ONLY,
    destroy() {},
  };
}
