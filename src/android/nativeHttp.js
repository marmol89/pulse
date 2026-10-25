/**
 * Red nativa de Android (plugin CapacitorHttp): las peticiones no salen del WebView, así que no
 * hay CORS ni con iTunes/Deezer/LRCLIB ni con el bucket. El plugin habla en texto: los cuerpos
 * binarios viajan en base64 (`dataType: 'file'`), salvo los de tipo application/json, que el plugin
 * escribe tal cual (texto) sin decodificar; las respuestas binarias llegan en base64, salvo el JSON
 * (ya interpretado) y los errores (texto).
 */

const BODYLESS = new Set([101, 204, 205, 304]);

export function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(String(text).replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cuerpo de la petición (string, bytes, Blob o stream web) → bytes, o null si no hay. */
async function bodyBytes(body) {
  if (body == null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof body.arrayBuffer === 'function') return new Uint8Array(await body.arrayBuffer());
  if (typeof body.getReader === 'function') return new Uint8Array(await new Response(body).arrayBuffer());
  throw new TypeError('Cuerpo de petición no admitido');
}

/** Datos de la respuesta del plugin → bytes, según cómo los haya entregado. */
function responseBytes(data, binary) {
  if (data == null || data === '') return new Uint8Array();
  if (typeof data === 'object') return new TextEncoder().encode(JSON.stringify(data)); // JSON ya interpretado
  if (!binary) return new TextEncoder().encode(String(data));
  try {
    return base64ToBytes(data);
  } catch {
    return new TextEncoder().encode(String(data)); // un error del servidor llega como texto
  }
}

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value)]));
}

/**
 * Petición nativa. Devuelve `{ status, headers, body }` (cabeceras en minúscula, cuerpo en bytes).
 * @param {{ request: (options) => Promise<{ status: number, headers: object, data: unknown }> }} http CapacitorHttp
 */
export async function nativeRequest(http, { url, method = 'GET', headers = {}, body = null, timeout }) {
  const bytes = await bodyBytes(body);
  const outgoing = { ...headers };
  const options = { url, method, headers: outgoing, responseType: 'arraybuffer' };
  if (timeout) Object.assign(options, { connectTimeout: timeout, readTimeout: timeout });
  if (bytes && bytes.length > 0) {
    // El plugin solo escribe el cuerpo si hay Content-Type.
    const typeHeader = Object.keys(outgoing).find((name) => name.toLowerCase() === 'content-type');
    if (!typeHeader) outgoing['Content-Type'] = 'application/octet-stream';
    // Con application/json escribe `data` como texto UTF-8 aunque se pida 'file' (CapacitorHttpUrlConnection.java):
    // en base64 llegaría al bucket el base64, no el JSON.
    if (String(outgoing[typeHeader] ?? '').includes('application/json')) Object.assign(options, { data: new TextDecoder().decode(bytes) });
    else Object.assign(options, { data: bytesToBase64(bytes), dataType: 'file' });
  }
  const response = await http.request(options);
  const status = response.status;
  // Con error (≥ 400) el plugin lee el cuerpo como texto aunque se pidiera binario.
  return { status, headers: lowerCaseHeaders(response.headers), body: method === 'HEAD' ? new Uint8Array() : responseBytes(response.data, status < 400) };
}

/** `fetch` sobre la red nativa (para createHttp de los datos de internet). */
export function createNativeFetch(http) {
  return async (url, init = {}) => {
    if (init.signal?.aborted) throw init.signal.reason ?? new Error('Petición cancelada');
    const { status, headers, body } = await nativeRequest(http, { url: String(url), method: init.method, headers: init.headers, body: init.body });
    return new Response(BODYLESS.has(status) ? null : body, { status, headers });
  };
}

/**
 * `requestHandler` para el SDK de S3 (como su FetchHttpHandler, pero por la red nativa).
 * El SDK solo mira la forma de la respuesta (statusCode, headers, body); el cuerpo va como Blob,
 * que es lo que entiende su versión de navegador para Body.transformToByteArray().
 */
export function createS3RequestHandler(http, { timeout = 30_000 } = {}) {
  return {
    metadata: { handlerProtocol: 'http/1.1' },

    async handle(request, { abortSignal } = {}) {
      if (abortSignal?.aborted) throw Object.assign(new Error('Petición cancelada'), { name: 'AbortError' });
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(request.query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) query.append(name, item ?? '');
      }
      const search = query.toString().replace(/\+/g, '%20');
      const port = request.port ? `:${request.port}` : '';
      const url = `${request.protocol}//${request.hostname}${port}${request.path}${search ? `?${search}` : ''}`;
      // El sistema pone Host y Content-Length a partir de la URL y del cuerpo.
      const { host, 'content-length': length, ...headers } = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
      const { status, headers: responseHeaders, body } = await nativeRequest(http, { url, method: request.method, headers, body: request.body, timeout });
      return { response: { statusCode: status, reason: '', headers: responseHeaders, body: new Blob([body]) } };
    },

    updateHttpClientConfig() {},

    httpHandlerConfigs() {
      return {};
    },

    destroy() {},
  };
}
