import path from 'node:path';
import { collectAudioFiles, readTrackRecords, toTrack } from './tracks.js';
import { isMissing } from './availability.js';

/** Las rutas llegan del renderer: solo se aceptan rutas absolutas. */
export function assertAbsolutePaths(paths) {
  if (!Array.isArray(paths) || !paths.every((entry) => typeof entry === 'string' && path.isAbsolute(entry))) {
    throw new TypeError('Se esperaba una lista de rutas absolutas');
  }
}

/** Importa archivos y carpetas a la biblioteca. Devuelve solo las pistas nuevas o recuperadas. */
export async function importPaths(store, paths) {
  assertAbsolutePaths(paths);
  const files = await collectAudioFiles(paths);
  // Las que se dieron por desaparecidas y vuelven a estar se recuperan con todos sus datos.
  const returning = files
    .map((file) => store.get(file))
    .filter((record) => record && isMissing(record))
    .map(({ missingSince, ...record }) => record);
  const fresh = await readTrackRecords(files.filter((file) => !store.has(file)));
  const changed = [...returning, ...fresh];
  if (changed.length > 0) {
    store.add(changed);
    await store.save();
  }
  return changed.map(toTrack);
}
