import path from 'node:path';
import { collectAudioFiles, readTrackRecords, toTrack } from './tracks.js';

/** Las rutas llegan del renderer: solo se aceptan rutas absolutas. */
export function assertAbsolutePaths(paths) {
  if (!Array.isArray(paths) || !paths.every((entry) => typeof entry === 'string' && path.isAbsolute(entry))) {
    throw new TypeError('Se esperaba una lista de rutas absolutas');
  }
}

/** Importa archivos y carpetas a la biblioteca. Devuelve solo las pistas nuevas. */
export async function importPaths(store, paths) {
  assertAbsolutePaths(paths);
  const files = (await collectAudioFiles(paths)).filter((file) => !store.has(file));
  const records = await readTrackRecords(files);
  if (records.length > 0) {
    store.add(records);
    await store.save();
  }
  return records.map(toTrack);
}
