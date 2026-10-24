import { normalizeConfig, parseCredentials, resolveConnection } from './connection.js';
import { createS3Storage, describeS3Error } from './storage.js';

/**
 * Conexión S3 de la app: la guardada, el cliente abierto y el alta desde el formulario o
 * desde un credentials.json. La clave secreta nunca sale de aquí.
 */
export function createS3Service({ connections, createStorage = createS3Storage }) {
  let storage = null;
  /** Credenciales importadas a la espera de que el usuario complete el bucket. */
  let pending = null;

  function open(config) {
    storage?.destroy();
    storage = config ? createStorage(config) : null;
  }

  return {
    async load() {
      await connections.load();
      open(connections.get());
    },

    /** Cliente del bucket conectado, o null si aún no hay conexión. */
    storage: () => storage,

    summary: () => connections.summary(),

    /** Comprueba y guarda la conexión. @returns {{ ok: true, summary, count } | { ok: false, error }} */
    async connect(input) {
      try {
        const config = normalizeConfig(input, pending ?? connections.get());
        const { config: resolved, count } = await resolveConnection(config, createStorage);
        await connections.save(resolved);
        pending = null;
        open(resolved);
        return { ok: true, summary: connections.summary(), count };
      } catch (error) {
        return { ok: false, error: error instanceof TypeError ? error.message : describeS3Error(error) };
      }
    },

    /** Usa un credentials.json. Si falta algo, devuelve el formulario relleno (sin la clave secreta). */
    async importCredentials(text) {
      let parsed;
      try {
        parsed = parseCredentials(text);
      } catch {
        return { ok: false, error: 'El archivo no es un credentials.json válido' };
      }
      pending = parsed;
      const result = await this.connect(parsed);
      const { secretAccessKey, ...fields } = parsed;
      return result.ok ? result : { ...result, fields };
    },
  };
}
