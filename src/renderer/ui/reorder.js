/**
 * Reordenar filas arrastrando su asa (ratón y dedo, con pointer events: el arrastre nativo de HTML no
 * funciona con el dedo en el WebView de Android) o con Alt+↑/↓ en la fila con el foco.
 * `onMove(path, to)`: `to` es la posición final de la fila (0 = la primera).
 */
export function enableReorder(list, { onMove, enabled }) {
  let drag = null;

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.track-row__grip');
    if (!handle || !enabled() || event.button > 0) return;
    event.preventDefault();
    const row = handle.closest('.track-row');
    handle.setPointerCapture?.(event.pointerId);
    drag = { row, path: row.dataset.path, to: null };
    row.classList.add('is-dragging');
  });

  list.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const others = rows(list).filter((row) => row !== drag.row);
    const to = dropIndex(others.map(middle), event.clientY);
    if (to === drag.to) return;
    drag.to = to;
    for (const row of others) row.classList.remove('is-drop-before', 'is-drop-after');
    if (others[to]) others[to].classList.add('is-drop-before');
    else others.at(-1)?.classList.add('is-drop-after');
  });

  const finish = (event) => {
    if (!drag) return;
    const { row, path, to } = drag;
    drag = null;
    row.classList.remove('is-dragging');
    for (const other of rows(list)) other.classList.remove('is-drop-before', 'is-drop-after');
    if (event.type === 'pointerup' && to !== null && to !== rows(list).indexOf(row)) onMove(path, to);
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);

  list.addEventListener('keydown', (event) => {
    const row = event.target;
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !row.classList?.contains('track-row') || !enabled()) return;
    event.preventDefault();
    const from = rows(list).indexOf(row);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (to >= 0 && to < rows(list).length) onMove(row.dataset.path, to);
  });
}

/** Posición de la fila soltada a la altura `y`, entre las demás (sus centros, de arriba abajo). */
export function dropIndex(middles, y) {
  const index = middles.findIndex((middle) => y < middle);
  return index < 0 ? middles.length : index;
}

function rows(list) {
  return [...list.querySelectorAll(':scope > .track-row')];
}

function middle(row) {
  const box = row.getBoundingClientRect();
  return box.top + box.height / 2;
}
