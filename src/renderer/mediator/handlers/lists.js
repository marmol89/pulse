import { EVENTS } from '../events.js';
import { applyLists, openCollection } from '../actions.js';

const songs = (count) => (count === 1 ? '1 canción' : `${count} canciones`);

/**
 * Listas de canciones del usuario: cargarlas, crearlas, renombrarlas y eliminarlas.
 * Las guarda el proceso main en el bucket; las de otros equipos llegan como lists-changed.
 */
export default {
  async [EVENTS.APP_READY](ctx) {
    applyLists(ctx, await ctx.library.lists());
  },

  [EVENTS.LISTS_CHANGED](ctx, lists) {
    applyLists(ctx, lists);
  },

  [EVENTS.NEW_LIST](ctx, paths = []) {
    ctx.listDialog.openCreate(paths);
  },

  /** Con canciones (desde "Añadir a una lista") se queda donde estaba; vacía, se abre para llenarla. */
  async [EVENTS.CREATE_LIST](ctx, { name, paths = [] }) {
    const result = await ctx.library.createList(name, paths);
    if (!result.ok) return ctx.listDialog.showError(result.error);
    ctx.listDialog.close();
    applyLists(ctx, result.lists);
    const list = ctx.lists.get(result.id);
    if (paths.length > 0) ctx.toast.show(`Lista «${list.name}» creada con ${songs(list.tracks.length)}`);
    else openCollection(ctx, { kind: 'list', id: result.id });
  },

  [EVENTS.EDIT_LIST](ctx, id) {
    const list = ctx.lists.get(id);
    if (list) ctx.listDialog.openEdit(list);
  },

  async [EVENTS.RENAME_LIST](ctx, { id, name }) {
    const result = await ctx.library.renameList(id, name);
    if (!result.ok) return ctx.listDialog.showError(result.error);
    ctx.listDialog.close();
    applyLists(ctx, result.lists);
  },

  async [EVENTS.DELETE_LIST](ctx, id) {
    const name = ctx.lists.get(id)?.name;
    const result = await ctx.library.deleteList(id);
    if (!result.ok) return ctx.listDialog.showError(result.error);
    ctx.listDialog.close();
    applyLists(ctx, result.lists);
    ctx.toast.show(`Lista «${name}» eliminada`);
  },
};
