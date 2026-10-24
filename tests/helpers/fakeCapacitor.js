/**
 * Plugins de Capacitor falsos para probar src/android/ en Node.
 *
 * fakeCapacitorHttp() se comporta como CapacitorHttp en Android (HttpRequestHandler.java): solo
 * escribe el cuerpo si hay Content-Type, con `dataType: 'file'` lo decodifica de base64, y responde
 * en base64 si se pide binario, salvo el JSON (ya interpretado) y los errores (texto).
 */
export function fakeCapacitorHttp(fetchImpl = fetch) {
  const calls = [];
  return {
    calls,
    async request({ url, method = 'GET', headers = {}, data, dataType, responseType }) {
      calls.push({ url, method, headers, dataType });
      const mutates = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      const hasType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
      const body = mutates && data != null && hasType ? (dataType === 'file' ? Buffer.from(data, 'base64') : String(data)) : undefined;
      const response = await fetchImpl(url, { method, headers, body });
      const type = response.headers.get('content-type') ?? '';
      const bytes = Buffer.from(await response.arrayBuffer());
      let out;
      if (response.status >= 400) out = type.includes('application/json') ? JSON.parse(bytes.toString()) : bytes.toString();
      else if (type.includes('application/json')) out = JSON.parse(bytes.toString());
      else if (responseType === 'arraybuffer' || responseType === 'blob') out = bytes.toString('base64');
      else out = bytes.toString();
      return { status: response.status, headers: Object.fromEntries(response.headers), data: out, url };
    },
  };
}

/** Plugin SecureStorage en memoria. */
export function fakeSecureStorage() {
  const items = new Map();
  return {
    items,
    async setKeyPrefix() {},
    async set(key, value) {
      items.set(key, value);
    },
    async get(key) {
      return items.has(key) ? items.get(key) : null;
    },
  };
}

/** Plugin Filesystem en memoria (lo justo para src/android/files.js; los datos binarios, en base64). */
export function fakeFilesystem() {
  const entries = new Map(); // ruta → { data, encoding }
  const calls = { readdir: 0, rejected: 0 };
  const missing = (path) => {
    calls.rejected += 1; // en el móvil, cada rechazo deja un error en la consola
    return Object.assign(new Error(`File does not exist: ${path}`), { code: 'OS-PLUG-FILE-0008' });
  };
  return {
    entries,
    calls,
    async readFile({ path, encoding }) {
      if (!entries.has(path)) throw missing(path);
      const stored = entries.get(path);
      const bytes = stored.encoding ? Buffer.from(stored.data, 'utf8') : Buffer.from(stored.data, 'base64');
      return { data: encoding ? bytes.toString('utf8') : bytes.toString('base64') };
    },
    async writeFile({ path, data, encoding }) {
      entries.set(path, { data, encoding });
      return { uri: `file:///data/${path}` };
    },
    async rename({ from, to }) {
      if (!entries.has(from)) throw missing(from);
      entries.set(to, entries.get(from));
      entries.delete(from);
    },
    async stat({ path }) {
      if (entries.has(path)) return { type: 'file' };
      if ([...entries.keys()].some((name) => name.startsWith(`${path}/`))) return { type: 'directory' };
      throw missing(path);
    },
    async deleteFile({ path }) {
      if (!entries.delete(path)) throw missing(path);
    },
    /** Como el plugin: la raíz ('') siempre existe; una carpeta que no existe, rechaza. */
    async readdir({ path }) {
      const prefix = path ? `${path}/` : '';
      const names = [...entries.keys()].filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length).split('/')[0]);
      if (path && names.length === 0) throw missing(path);
      calls.readdir += 1;
      return { files: [...new Set(names)].map((name) => ({ name })) };
    },
    async getUri({ path }) {
      return { uri: `file:///data/user/0/com.marmol89.pulse/files/${path}` };
    },
  };
}
