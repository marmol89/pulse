const TIMEOUT_MS = 10_000;
/** Respuestas que significan "ahora no, prueba más tarde" (iTunes usa 403 al superar su límite). */
const RETRY_LATER = new Set([403, 429]);

/** Fallo pasajero (sin red, límite de peticiones, servicio caído): se reintenta más tarde. */
export class TransientError extends Error {}

/**
 * Cliente HTTP mínimo sobre un fetch inyectado: net.fetch de Electron en la app
 * (respeta el proxy del sistema) y uno falso en los tests.
 */
export function createHttp(fetch, { userAgent, timeout = TIMEOUT_MS }) {
  async function request(url, accept) {
    const host = new URL(url).host;
    let response;
    try {
      const pending = fetch(url, { headers: { 'User-Agent': userAgent, Accept: accept }, signal: AbortSignal.timeout(timeout) });
      response = await withTimeout(pending, timeout);
    } catch (error) {
      throw new TransientError(`Sin respuesta de ${host}`, { cause: error });
    }
    if (RETRY_LATER.has(response.status) || response.status >= 500) {
      throw new TransientError(`${host} respondió ${response.status}`);
    }
    return response;
  }

  return {
    /** JSON de la URL, o null si no existe (404). */
    async json(url) {
      const response = await request(url, 'application/json');
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${new URL(url).host} respondió ${response.status}`);
      return response.json();
    },

    /** Imagen de la URL ({ type, data }) o null si no es una imagen válida o pesa más de `maxBytes`. */
    async image(url, maxBytes) {
      const response = await request(url, 'image/*');
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) return null;
      const data = Buffer.from(await response.arrayBuffer());
      return data.length > 0 && data.length <= maxBytes ? { type, data } : null;
    },
  };
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
