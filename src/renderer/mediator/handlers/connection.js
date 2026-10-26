import { EVENTS } from '../events.js';
import { finishConnection, showSource } from '../actions.js';

/**
 * Conexión con el bucket S3: el formulario, importar un credentials.json y la primera
 * sincronización al conectar. Las claves solo viajan al proceso main.
 * Las carpetas del equipo (la otra pestaña del formulario) están en handlers/folders.js.
 */
export default {
  async [EVENTS.APP_READY](ctx) {
    const summary = await ctx.library.connection();
    showSource(ctx, summary);
    if (!summary) ctx.connection.open(null); // primera vez: sin bucket ni carpetas no hay música
  },

  async [EVENTS.OPEN_CONNECTION](ctx) {
    ctx.connection.open(await ctx.library.connection());
  },

  async [EVENTS.SAVE_CONNECTION](ctx, input) {
    ctx.connection.setBusy(true);
    try {
      await connected(ctx, await ctx.library.saveConnection(input));
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
      await connected(ctx, result);
    } finally {
      ctx.connection.setBusy(false);
    }
  },
};

function connected(ctx, result) {
  return finishConnection(ctx, result, result.ok ? `Conectado a «${result.summary.bucket}»` : '');
}
