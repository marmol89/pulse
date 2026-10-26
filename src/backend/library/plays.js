import { createSharedRecords, resultOf } from './shared.js';
import { isTrackId } from './remote.js';

/** Caché local (en los archivos de la app) y copia compartida en el bucket, bajo la carpeta de la conexión. */
export const PLAYS_FILE = 'plays.json';
const REMOTE_FILE = 'escuchas.json';
const DEVICE_FILE = 'device.json';
const SEPARATOR = '|';

const valid = (record) =>
  typeof record?.id === 'string' &&
  typeof record.device === 'string' &&
  record.id === `${record.device}${SEPARATOR}${record.path}` &&
  isTrackId(record.path) &&
  Number.isInteger(record.count) &&
  record.count > 0 &&
  typeof record.createdAt === 'number' &&
  typeof record.updatedAt === 'number';

/** Resultado para la interfaz: { ok: true, plays } o { ok: false, error } con el motivo en español. */
export const playResult = resultOf('plays');

/**
 * Identificador de este equipo (se crea la primera vez y se guarda en device.json). Separa las escuchas de cada
 * equipo para que al juntar copias no se pisen.
 */
export async function deviceId(files, { random = () => globalThis.crypto.randomUUID() } = {}) {
  try {
    const saved = JSON.parse((await files.readText(DEVICE_FILE)) ?? 'null');
    if (typeof saved?.id === 'string' && saved.id && !saved.id.includes(SEPARATOR)) return saved.id;
  } catch {
    // dañado: se crea otro (las escuchas de antes de este equipo siguen contando con su id viejo)
  }
  const id = random();
  await files.write(DEVICE_FILE, JSON.stringify({ id }));
  return id;
}

/** Registros → { ruta: escuchas en total }, sumando las de todos los equipos. */
function totals(records) {
  const counts = {};
  for (const { path, count } of records) counts[path] = (counts[path] ?? 0) + count;
  return counts;
}

/**
 * Cuántas veces ha sonado cada canción, compartido por todos los Pulse del mismo bucket (metadatos/escuchas.json).
 * Un registro por canción **y por equipo** (`equipo|ruta`): cada equipo solo cambia los suyos, así que al juntar
 * copias gana siempre el más reciente de cada uno sin perder escuchas, y el total es la suma.
 * `all()` y `add()` devuelven { ruta: escuchas }.
 */
export function createPlayStore({ device, now = Date.now, onChange = () => {}, ...deps }) {
  if (!device) throw new Error('Falta el identificador del equipo');
  const records = createSharedRecords({
    ...deps,
    now,
    onChange: (shown) => onChange(totals(shown)),
    key: 'plays',
    localFile: PLAYS_FILE,
    remoteFile: REMOTE_FILE,
    tag: 'escuchas',
    label: 'las escuchas',
    offlineMessage: 'Conecta tu bucket para contar lo que escuchas',
    valid,
    show: (record) => record,
  });

  return {
    load: records.load,

    all: () => totals(records.all()),

    /** Se ha escuchado una canción (lo bastante para contar). */
    async add(path) {
      if (!isTrackId(path)) throw new TypeError('Esa canción no está en tu biblioteca');
      const id = `${device}${SEPARATOR}${path}`;
      const shown = await records.update((plays) => {
        const mine = plays.find((record) => record.id === id);
        const at = Math.max(now(), (mine?.updatedAt ?? 0) + 1);
        const next = { id, device, path, count: (mine?.count ?? 0) + 1, createdAt: mine?.createdAt ?? at, updatedAt: at };
        return mine ? plays.map((record) => (record === mine ? next : record)) : [...plays, next];
      });
      return { plays: totals(shown) };
    },

    sync: records.sync,
    syncSoon: records.syncSoon,
    hasPending: records.hasPending,
  };
}
