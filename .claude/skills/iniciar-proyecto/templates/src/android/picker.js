/**
 * Selector de archivos del sistema (en Android abre el de documentos o el de audio) con un
 * <input type="file"> que no llega a verse. Devuelve los File elegidos, o null si se cancela.
 */
export function pickFiles(document, { accept, multiple = false }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    const finish = (files) => {
      input.remove();
      resolve(files && files.length > 0 ? [...files] : null);
    };
    input.addEventListener('change', () => finish(input.files), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}
