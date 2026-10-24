import { EVENTS } from '../events.js';

/**
 * Conexión con el bucket S3: el formulario, importar un credentials.json y la primera
 * sincronización al conectar. Las claves solo viajan al proceso main.
 */
export default {
  async [EVENTS.APP_READY](ctx) {
    const summary = await ctx.library.connection();
    ctx.router.setConnection(summary);
    if (!summary) ctx.connection.open(null); // primera vez: sin bucket no hay música
  },

  async [EVENTS.OPEN_CONNECTION](ctx) {
    ctx.connection.open(await ctx.library.connection());
  },

  async [EVENTS.SAVE_CONNECTION](ctx, input) {
    ctx.connection.setBusy(true);
    try {
      await finish(ctx, await ctx.library.saveConnection(input));
    } finally {
      ctx.connection.setBusy(false);
    }
  },

  async [EVENTS.IMPORT_CREDENTIALS](ctx) {
    ctx.connection.setBusy(true);
    try {
      const result = await ctx.library.importCredentials();
      if (!result) return; // diálogo cancelado
      if (!result.ok && result.fields) ctx.connection.fill(result.fields);
      await finish(ctx, result);
    } finally {
      ctx.connection.setBusy(false);
    }
  },
};

async function finish(ctx, result) {
  if (!result.ok) {
    ctx.connection.showError(result.error);
    return;
  }
  ctx.connection.close();
  ctx.router.setConnection(result.summary);
  ctx.toast.show(`Conectado a «${result.summary.bucket}»`);
  try {
    await ctx.library.sync(); // las canciones llegan con library-changed
  } catch {
    ctx.toast.show('No se pudo leer el bucket', { tone: 'error' });
  }
}
