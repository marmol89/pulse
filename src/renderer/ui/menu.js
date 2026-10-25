import { h } from './dom.js';
import { icon } from './icons.js';

let openMenu = null;

/**
 * Menú emergente junto a un botón (el "⋯" de las filas). Componente de UI: cada opción llama a su
 * `onSelect`. Se cierra al elegir, con Esc, al hacer clic fuera o al hacer scroll; las flechas
 * mueven el foco. Solo hay uno abierto a la vez.
 * @param {HTMLElement} anchor @param {{ label: string, icon?: string, onSelect: () => void }[]} items
 */
export function showMenu(anchor, items, { label = 'Opciones' } = {}) {
  closeMenu();
  const buttons = items.map((item) =>
    h('button', { type: 'button', class: 'menu__item', role: 'menuitem' }, item.icon ? icon(item.icon) : null, h('span', { class: 'ellipsis' }, item.label)),
  );
  const menu = h('div', { class: 'menu', role: 'menu', 'aria-label': label }, buttons);
  buttons.forEach((button, index) =>
    button.addEventListener('click', () => {
      closeMenu();
      items[index].onSelect();
    }),
  );
  menu.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation(); // Esc no debe cerrar también Reproduciendo
      closeMenu();
      anchor.focus();
    }
  });
  document.body.append(menu);
  place(menu, anchor);
  anchor.setAttribute('aria-expanded', 'true');

  const onPointer = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  };
  const onScroll = () => closeMenu();
  // En el siguiente ciclo: el clic que lo abre no debe cerrarlo.
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
  });
  openMenu = {
    menu,
    close() {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
      anchor.setAttribute('aria-expanded', 'false');
      menu.remove();
    },
  };
  buttons[0]?.focus();
  return menu;
}

export function closeMenu() {
  openMenu?.close();
  openMenu = null;
}

/** Debajo del botón, alineado a su derecha; encima si no cabe abajo. */
function place(menu, anchor) {
  const box = anchor.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = menu;
  const below = box.bottom + 4;
  const top = below + height > window.innerHeight ? Math.max(box.top - height - 4, 4) : below;
  const left = Math.min(Math.max(box.right - width, 4), window.innerWidth - width - 4);
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}
