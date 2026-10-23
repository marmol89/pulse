import { icon } from './icons.js';

/**
 * Crea un elemento. Los hijos de texto se insertan como texto (nunca como HTML),
 * así los metadatos de los archivos no pueden inyectar marcado.
 * Atributos con valor null/false se omiten; `on<evento>` añade un listener.
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  element.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return element;
}

/** Botón redondo solo con icono; `label` es el nombre accesible y el tooltip. */
export function iconButton(name, label, { className = '', ...props } = {}) {
  return h('button', { type: 'button', class: `icon-button ${className}`.trim(), 'aria-label': label, title: label, ...props }, icon(name));
}

/** Cambia el icono de un botón conservando el resto. */
export function setIcon(element, name) {
  element.querySelector('svg')?.replaceWith(icon(name));
}

/** Botón de corazón (favorito), como en el mini-player y las filas del diseño. */
export function favoriteButton(isFavorite = false, props = {}) {
  const button = iconButton('heart-outline', 'Añadir a favoritos', { className: 'favorite-button', ...props });
  setFavoriteButton(button, isFavorite);
  return button;
}

export function setFavoriteButton(button, isFavorite) {
  const label = isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos';
  button.classList.toggle('is-active', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('aria-label', label);
  button.title = label;
  setIcon(button, isFavorite ? 'heart' : 'heart-outline');
}
