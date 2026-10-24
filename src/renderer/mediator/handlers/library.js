import { EVENTS } from '../events.js';
import { refreshLibraryViews } from '../actions.js';

/** Biblioteca: cargar la guardada al arrancar e importar archivos, carpetas o lo que se suelte. */
export default {
  async [EVENTS.APP_READY](ctx) {
    ctx.catalog.add(await ctx.library.load());
    refreshLibraryViews(ctx);
  },

  async [EVENTS.OPEN_FILES](ctx) {
    await importPaths(ctx, await ctx.library.chooseFiles());
  },

  async [EVENTS.OPEN_FOLDER](ctx) {
    const folder = await ctx.library.chooseFolder();
    if (folder) await importPaths(ctx, [folder]);
  },

  async [EVENTS.FILES_DROPPED](ctx, files) {
    await importPaths(ctx, ctx.library.pathsForFiles(files));
  },
};

async function importPaths(ctx, paths) {
  if (!paths?.length) return;
  ctx.toast.show('Analizando tu música…', { sticky: true });
  try {
    const added = ctx.catalog.add(await ctx.library.import(paths));
    ctx.toast.show(addedMessage(added));
  } catch (error) {
    ctx.toast.show('No se pudo importar la música', { tone: 'error' });
    throw error;
  } finally {
    refreshLibraryViews(ctx);
  }
}

function addedMessage(added) {
  if (added === 0) return 'No hay canciones nuevas';
  return added === 1 ? '1 canción añadida' : `${added} canciones añadidas`;
}
