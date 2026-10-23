/**
 * Iconos SVG inline. Los trazados salen de app-musica-figma.svg (centrados en 0,0,
 * por eso los viewBox son negativos); los que no estaban en el diseño siguen su estilo.
 * Todos usan currentColor para heredar el color del estado.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART = 'M0 7 C-8 1 -10 -3 -10 -5 C-10 -9 -6 -11 -3 -9 C-1 -8 0 -6 0 -6 C0 -6 1 -8 3 -9 C6 -11 10 -9 10 -5 C10 -3 8 1 0 7 Z';
const REPEAT = '<path d="M-8 2 V-2 A5 5 0 0 1 -3 -7 H9"/><path d="M6 -10 L9 -7 L6 -4"/><path d="M8 -2 V2 A5 5 0 0 1 3 7 H-9"/><path d="M-6 10 L-9 7 L-6 4"/>';
const SPEAKER = '<path d="M-10 -4 H-6 L0 -9 V9 L-6 4 H-10 Z" fill="currentColor" stroke="none"/>';

const ICONS = {
  // Tab bar del diseño
  home: { viewBox: '-12 -12 24 24', body: '<path d="M-10 10V-2L0-10L10-2V10H3V3H-3V10Z"/>' },
  search: { viewBox: '-12 -12 24 24', stroke: 2.2, body: '<circle cx="-2" cy="-2" r="7"/><path d="M3 3L9 9"/>' },
  library: {
    viewBox: '-12 -12 24 24',
    body: '<rect x="-10" y="-10" width="4" height="20" rx="1"/><rect x="-3" y="-10" width="4" height="20" rx="1"/><rect x="4" y="-9" width="4" height="19" rx="1" transform="rotate(-18 6 0)"/>',
  },
  // Reproductor
  heart: { viewBox: '-12 -14 24 24', body: `<path d="${HEART}"/>` },
  'heart-outline': { viewBox: '-12 -14 24 24', stroke: 2, body: `<path d="${HEART}"/>` },
  play: { viewBox: '-14 -14 28 28', body: '<path d="M-7 -12 L11 0 L-7 12 Z"/>' },
  pause: { viewBox: '-16 -16 32 32', body: '<rect x="-12" y="-15" width="8" height="30" rx="2.5"/><rect x="4" y="-15" width="8" height="30" rx="2.5"/>' },
  previous: { viewBox: '-13 -13 26 26', body: '<path d="M10 -12 L-6 0 L10 12 Z"/><rect x="-12" y="-12" width="4" height="24" rx="1.5"/>' },
  next: { viewBox: '-13 -13 26 26', body: '<path d="M-10 -12 L6 0 L-10 12 Z"/><rect x="8" y="-12" width="4" height="24" rx="1.5"/>' },
  shuffle: {
    viewBox: '-12 -12 24 24',
    stroke: 2,
    body: '<path d="M-10 -6 H-4 L4 6 H10"/><path d="M-10 6 H-4 L4 -6 H10"/><path d="M7 -9 L10 -6 L7 -3"/><path d="M7 3 L10 6 L7 9"/>',
  },
  repeat: { viewBox: '-12 -12 24 24', stroke: 2, body: REPEAT },
  'repeat-one': { viewBox: '-12 -12 24 24', stroke: 2, body: `${REPEAT}<path d="M-1.5 -1.5 L0.5 -3 V3" stroke-width="1.6"/>` },
  'chevron-down': { viewBox: '-12 -12 24 24', stroke: 2.5, body: '<path d="M-10 -5 L0 5 L10 -5"/>' },
  'chevron-up': { viewBox: '-12 -12 24 24', stroke: 2.5, body: '<path d="M-10 5 L0 -5 L10 5"/>' },
  back: { viewBox: '-12 -12 24 24', stroke: 2.5, body: '<path d="M5 -10 L-5 0 L5 10"/>' },
  device: { viewBox: '-12 -12 24 24', stroke: 2, body: '<rect x="-9" y="-10" width="18" height="20" rx="3"/><circle cx="0" cy="3" r="3"/>' },
  queue: { viewBox: '-12 -12 24 24', stroke: 2, body: '<path d="M-9 -7 H9"/><path d="M-9 0 H9"/><path d="M-9 7 H3"/>' },
  // No estaban en el diseño: mismo trazo y remates redondeados
  volume: { viewBox: '-12 -12 24 24', stroke: 2, body: `${SPEAKER}<path d="M4 -5 A7 7 0 0 1 4 5"/><path d="M7 -8.5 A11 11 0 0 1 7 8.5"/>` },
  'volume-muted': { viewBox: '-12 -12 24 24', stroke: 2, body: `${SPEAKER}<path d="M4 -4 L10 4"/><path d="M10 -4 L4 4"/>` },
  folder: { viewBox: '-12 -12 24 24', stroke: 2, body: '<path d="M-10 8 V-8 H-3 L-1 -5 H10 V8 Z"/><path d="M0 -1 V5"/><path d="M-3 2 H3"/>' },
  note: {
    viewBox: '-12 -12 24 24',
    stroke: 2,
    body: '<path d="M-3 6 V-8 L8 -10 V4"/><circle cx="-6" cy="6" r="3"/><circle cx="5" cy="4" r="3"/>',
  },
  pulse: { viewBox: '-12 -12 24 24', stroke: 2.2, body: '<path d="M-11 0 H-6 L-3 -7 L1 7 L4 -3 L6 0 H11"/>' },
};

/** @param {string} name @param {{ label?: string }} [options] @returns {SVGSVGElement} */
export function icon(name, { label = null } = {}) {
  const definition = ICONS[name];
  if (!definition) throw new Error(`Icono desconocido: ${name}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', definition.viewBox);
  svg.setAttribute('class', `icon icon--${name}`);
  if (definition.stroke) {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(definition.stroke));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  } else {
    svg.setAttribute('fill', 'currentColor');
  }
  svg.innerHTML = definition.body; // marcado estático de este archivo, nunca datos del usuario
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}

export const ICON_NAMES = Object.keys(ICONS);
