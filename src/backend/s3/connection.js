import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Conexión S3 guardada en userData. La clave secreta se cifra con el almacén seguro del
 * sistema (safeStorage: DPAPI en Windows, llavero en Linux) y nunca sale del proceso main.
 *
 * @param {{ encrypt: (text: string) => Promise<string>, decrypt: (text: string) => Promise<{ text: string, reencrypt?: boolean }> }} crypto
 *   `reencrypt`: el sistema cambió su clave y conviene volver a cifrar el secreto.
 */
export function createConnectionStore(file, { encrypt, decrypt }) {
  let config = null;

  async function write(next) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify({ ...next, secretAccessKey: await encrypt(next.secretAccessKey) }));
    await rename(temporary, file);
  }

  return {
    async load() {
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        const { text, reencrypt } = await decrypt(saved.secretAccessKey);
        config = { ...saved, secretAccessKey: text };
        if (reencrypt) await write(config).catch((error) => console.warn('[s3] no se pudo volver a cifrar la clave', error));
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[s3] no se pudo leer la conexión guardada', error);
        config = null;
      }
    },

    get() {
      return config;
    },

    /** Lo que puede ver la ventana: todo menos la clave secreta. */
    summary() {
      if (!config) return null;
      const { endpoint, accessKeyId, bucket, prefix } = config;
      return { endpoint, accessKeyId, bucket, prefix };
    },

    async save(next) {
      await write(next);
      config = next;
    },

    async clear() {
      await rm(file, { force: true });
      config = null;
    },
  };
}

/**
 * Valida lo que llega del formulario. Si no se reescribe la clave secreta y la clave de acceso
 * no cambia, se conserva la guardada.
 */
export function normalizeConfig(input, saved = null) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const endpoint = text(input?.endpoint).replace(/\/+$/, '');
  const accessKeyId = text(input?.accessKeyId);
  let secretAccessKey = text(input?.secretAccessKey);
  if (!secretAccessKey && saved && saved.accessKeyId === accessKeyId) secretAccessKey = saved.secretAccessKey;
  if (!/^https?:\/\/[^\s/]+/i.test(endpoint)) throw new TypeError('La dirección del servidor debe empezar por https:// o http://');
  if (!accessKeyId) throw new TypeError('Falta la clave de acceso');
  if (!secretAccessKey) throw new TypeError('Falta la clave secreta');
  const prefix = text(input?.prefix).replace(/^\/+/, '');
  return { endpoint, accessKeyId, secretAccessKey, bucket: text(input?.bucket), prefix };
}

/** Lee un credentials.json: formato de MinIO (url, accessKey, secretKey) o estilo AWS. */
export function parseCredentials(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    endpoint: data.url ?? data.endpoint ?? '',
    accessKeyId: data.accessKey ?? data.accessKeyId ?? data.AccessKeyId ?? '',
    secretAccessKey: data.secretKey ?? data.secretAccessKey ?? data.SecretAccessKey ?? '',
    bucket: data.bucket ?? '',
    prefix: data.prefix ?? '',
  };
}

/**
 * Comprueba una conexión antes de guardarla. Sin bucket, usa el único disponible.
 * @returns {Promise<{ config, count }>} la conexión completa y cuántas canciones hay
 */
export async function resolveConnection(config, createStorage) {
  let resolved = config;
  if (!resolved.bucket) {
    const probe = createStorage(resolved);
    try {
      const buckets = await probe.listBuckets();
      if (buckets.length !== 1) {
        throw new TypeError(buckets.length === 0 ? 'No hay ningún bucket en el servidor' : `Indica el bucket: hay ${buckets.length} (${buckets.join(', ')})`);
      }
      resolved = { ...resolved, bucket: buckets[0] };
    } finally {
      probe.destroy();
    }
  }
  const storage = createStorage(resolved);
  try {
    return { config: resolved, count: (await storage.listAudio()).length };
  } finally {
    storage.destroy();
  }
}
