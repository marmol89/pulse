/** Minúsculas y sin tildes: "Canción Ñoña" → "cancion nona". Para buscar y agrupar. */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Comparador alfabético en español (ignora mayúsculas y tildes). */
export const compareText = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare;
