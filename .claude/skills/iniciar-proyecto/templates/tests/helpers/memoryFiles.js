/**
 * Adaptador `files` del backend en memoria (como src/main/files.js o el de Android, sin disco).
 * `entries` permite partir de archivos ya guardados: { 'library.json': '…' }.
 */
export function memoryFiles(entries = {}) {
  const data = new Map(Object.entries(entries).map(([name, value]) => [name, toBytes(value)]));
  return {
    data,
    async read(name) {
      return data.has(name) ? data.get(name).slice() : null;
    },
    async readText(name) {
      return data.has(name) ? new TextDecoder().decode(data.get(name)) : null;
    },
    async write(name, value) {
      data.set(name, toBytes(value));
    },
    async exists(name) {
      return data.has(name);
    },
    async remove(name) {
      data.delete(name);
    },
    /** Texto guardado (o undefined), para las comprobaciones. */
    text(name) {
      return data.has(name) ? new TextDecoder().decode(data.get(name)) : undefined;
    },
  };
}

function toBytes(value) {
  return typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
}
