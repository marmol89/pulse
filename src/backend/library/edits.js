/**
 * Datos de una canción cambiados a mano ("Editar datos"). Van aparte, en `edited` (solo los campos que difieren de
 * lo leído del archivo o de internet) con su fecha `editedAt`, y ganan a todo lo demás al pintar la pista (toTrack).
 * Así "Restaurar datos del archivo" solo tiene que quitarlos, y viajan con el registro en metadatos/biblioteca.json.
 * Restaurar deja `edited: null` con su fecha: entre dos copias gana la edición más reciente (también la de quitarla).
 */
const TEXT_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'genre'];
const NUMBER_FIELDS = { year: 9999, trackNo: 999, disc: 99 };
const MAX_TEXT = 200;

export const EDITABLE_FIELDS = [...TEXT_FIELDS, ...Object.keys(NUMBER_FIELDS)];

/**
 * Lo que se puede guardar de un formulario: textos recortados (título y artista no pueden quedar vacíos: vacíos
 * vuelven a los del archivo) y números enteros dentro de su rango (0 = sin dato).
 */
export function cleanEdits(input) {
  const edits = {};
  for (const field of TEXT_FIELDS) {
    if (typeof input?.[field] !== 'string') continue;
    const value = input[field].replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (value || !['title', 'artist'].includes(field)) edits[field] = value;
  }
  for (const [field, max] of Object.entries(NUMBER_FIELDS)) {
    if (input?.[field] === undefined || input[field] === '') continue;
    const value = Number(input[field]);
    if (Number.isInteger(value) && value >= 0 && value <= max) edits[field] = value;
  }
  return edits;
}

/** El registro con sus datos editados encima. */
export function applyEdits(record) {
  return record?.edited ? { ...record, ...record.edited } : record;
}

/**
 * Guarda el formulario entero `changes` (o, con null, quita los datos editados). Solo quedan los campos que difieren
 * de los del archivo e internet: un título vacío o igual al del archivo vuelve a ser el del archivo.
 * @returns el registro nuevo
 */
export function withEdits(record, changes, now = Date.now()) {
  const edits = Object.entries(changes === null ? {} : cleanEdits(changes)).filter(
    ([field, value]) => record[field] !== value,
  );
  return { ...record, edited: edits.length > 0 ? Object.fromEntries(edits) : null, editedAt: now };
}

/** Entre la copia que hay y la que llega, la edición más reciente (el resto del registro es el que llega). */
export function keepNewestEdits(incoming, previous) {
  if ((previous?.editedAt ?? 0) <= (incoming.editedAt ?? 0)) return incoming;
  return { ...incoming, edited: previous.edited ?? null, editedAt: previous.editedAt };
}

/**
 * "Editar datos" de una pista de la biblioteca (`changes`: el formulario; null: restaurar los del archivo). Se guarda
 * en library.json y de ahí sube a metadatos/biblioteca.json. @returns {Promise<{ ok: true, record } | { ok: false, error }>}
 */
export async function editRecord(store, id, changes, now = Date.now) {
  const record = store.get(id);
  if (!record) return { ok: false, error: 'Esa canción ya no está en tu biblioteca' };
  const updated = withEdits(record, changes, now());
  store.add([updated]);
  await store.save();
  return { ok: true, record: updated };
}
