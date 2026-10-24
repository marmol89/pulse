import { EVENTS } from '../events.js';

/**
 * Subir canciones del ordenador al bucket: con "Subir canciones" o arrastrándolas a la ventana.
 * El proceso main sincroniza al terminar, así que llegan a la biblioteca con library-changed.
 */
export default {
  async [EVENTS.UPLOAD_SONGS](ctx) {
    await upload(ctx, () => ctx.library.chooseAndUpload());
  },

  async [EVENTS.FILES_DROPPED](ctx, files) {
    await upload(ctx, () => ctx.library.uploadFiles(files));
  },

  [EVENTS.UPLOAD_PROGRESS](ctx, { current, total, name }) {
    ctx.toast.show(total === 1 ? `Subiendo «${name}»…` : `Subiendo ${current} de ${total}: «${name}»…`, { sticky: true });
  },
};

async function upload(ctx, start) {
  let result;
  try {
    result = await start();
  } catch {
    ctx.toast.show('No se pudieron subir las canciones', { tone: 'error' });
    return;
  }
  if (!result) return; // diálogo cancelado
  if (!result.ok) {
    ctx.toast.show(result.error, { tone: 'error' });
    if (result.needsConnection) ctx.connection.open(null);
    return;
  }
  const { message, tone } = summary(result);
  ctx.toast.show(message, { tone });
}

function summary({ total, uploaded, skipped, failed }) {
  if (total === 0) return { message: 'No hay canciones de audio en lo que has elegido', tone: 'error' };
  const parts = [];
  if (uploaded > 0) parts.push(uploaded === 1 ? '1 canción subida' : `${uploaded} canciones subidas`);
  if (skipped > 0) parts.push(skipped === 1 ? '1 ya estaba en el bucket' : `${skipped} ya estaban en el bucket`);
  // Un solo fallo: se explica por qué (p. ej. claves sin permiso de escritura).
  if (failed.length === 1) parts.push(`«${failed[0].name}» no se pudo subir: ${failed[0].error}`);
  if (failed.length > 1) parts.push(`${failed.length} no se pudieron subir: ${failed[0].error}`);
  return { message: parts.join(' · '), tone: uploaded === 0 && failed.length > 0 ? 'error' : 'info' };
}
