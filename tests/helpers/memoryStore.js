/** Biblioteca en memoria con la misma interfaz que createLibraryStore(); cuenta los guardados. */
export function memoryStore(records = []) {
  const map = new Map(records.map((record) => [record.path, record]));
  return {
    saves: 0,
    all: () => [...map.values()],
    get: (path) => map.get(path) ?? null,
    has: (path) => map.has(path),
    add(list) {
      for (const record of list) map.set(record.path, record);
    },
    remove(paths) {
      for (const path of paths) map.delete(path);
    },
    async save() {
      this.saves += 1;
    },
  };
}
