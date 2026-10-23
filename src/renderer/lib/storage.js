/**
 * Adaptador mínimo sobre localStorage (u otro backend con getItem/setItem).
 * Guarda JSON con prefijo y nunca lanza: si el almacenamiento no está
 * disponible, get() devuelve el valor por defecto y set() no hace nada.
 */
export function createStorage(backend = globalThis.localStorage, prefix = 'pulse.') {
  return {
    get(key, fallback) {
      try {
        const raw = backend?.getItem(prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        backend?.setItem(prefix + key, JSON.stringify(value));
      } catch {
        // Sin espacio o sin permisos: la app sigue funcionando sin persistir.
      }
    },
  };
}

/** Backend en memoria con la misma interfaz que localStorage (útil en tests). */
export function createMemoryBackend(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}
