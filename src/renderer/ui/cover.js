import { h } from './dom.js';

/** Gradientes y formas decorativas de las portadas del diseño (Neón, Ola Azul, Atardecer, Selva). */
const GRADIENTS = ['accent', 'cool', 'warm', 'green'];
const SHAPES = ['rings', 'ring', 'disc', 'triangle'];

/** FNV-1a de 32 bits: el mismo texto da siempre la misma portada. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Portada generada para una semilla (función pura). */
export function coverStyle(seed) {
  const hash = hashString(seed);
  return { gradient: GRADIENTS[hash % GRADIENTS.length], shape: SHAPES[(hash >>> 8) % SHAPES.length] };
}

/** Las pistas de un mismo álbum comparten portada generada. */
export function trackSeed(track) {
  return track.album || track.title || track.path;
}

/**
 * Portada: la carátula real si existe y carga; si no, la generada (queda debajo
 * de la imagen, así que un error de carga deja ver la generada).
 * Usa `tag: 'span'` dentro de botones (un <div> no es válido ahí).
 */
export function createCover({ src = null, seed = '', className = '', tag = 'div' } = {}) {
  const { gradient, shape } = coverStyle(seed);
  const cover = h(tag, { class: `cover cover--${gradient} cover--${shape} ${className}`.trim() });
  if (src) {
    const image = h('img', { class: 'cover__image', src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
    image.addEventListener('error', () => image.remove(), { once: true });
    cover.append(image);
  }
  return cover;
}
