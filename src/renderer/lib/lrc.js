const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\]/im;

/**
 * Letra sincronizada (LRC) → versos ordenados por tiempo: [{ time (s), text }].
 * Admite varias marcas por verso ("[00:10.00][00:50.00] estribillo") y la etiqueta [offset:±ms]
 * (positiva: la letra va antes). Las demás etiquetas ([ar:], [ti:]…) se ignoran.
 */
export function parseLrc(text) {
  const source = String(text ?? '');
  const offset = Number(source.match(OFFSET_TAG)?.[1] ?? 0) / 1000;
  const lines = [];
  for (const raw of source.split(/\r?\n/)) {
    const times = [...raw.matchAll(TIME_TAG)].map(([, minutes, seconds]) => Number(minutes) * 60 + Number(seconds.replace(':', '.')));
    if (times.length === 0) continue;
    const words = raw.replace(TIME_TAG, '').trim();
    for (const time of times) lines.push({ time: Math.max(0, time - offset), text: words });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Índice del verso que suena en `seconds` (el último que ya ha empezado), o -1 antes del primero. */
export function activeLine(lines, seconds) {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= seconds) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
