/**
 * Botón atrás de Android, a través de los mismos controles que usaría el usuario (la interfaz no sabe
 * de Android): cierra el formulario, "Tu música" o Reproduciendo (como Esc), vuelve desde una
 * colección y, si no hay nada que cerrar, deja la app en segundo plano sin pararla (sigue sonando).
 * @returns {'dialog'|'escape'|'back'|'minimize'} lo que ha hecho
 */
export function handleBackButton(document, { minimize }) {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    dialog.close();
    return 'dialog';
  }
  if (document.querySelector('.now-playing.is-open, .sidebar.is-menu-open')) {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'escape';
  }
  const back = document.querySelector('.view--collection:not([hidden]) .back-button');
  if (back) {
    back.click();
    return 'back';
  }
  minimize();
  return 'minimize';
}
