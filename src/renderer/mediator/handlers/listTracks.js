import { EVENTS } from '../events.js';
import { applyLists } from '../actions.js';

/** Canciones de las listas: elegir a qué lista va una, añadirla y quitarla. */
export default {
  [EVENTS.CHOOSE_LIST](ctx, path) {
    const target = path ?? ctx.playlist.current()?.path;
    if (target) ctx.listDialog.openPicker(ctx.lists.all(), [target]);
  },

  async [EVENTS.ADD_TO_LIST](ctx, { id, paths }) {
    const added = paths.some((path) => !ctx.lists.includes(id, path));
    const result = await ctx.library.addToList(id, paths);
    if (!result.ok) return ctx.listDialog.showError(result.error);
    ctx.listDialog.close();
    applyLists(ctx, result.lists);
    const name = ctx.lists.get(id)?.name;
    ctx.toast.show(added ? `Añadida a «${name}»` : `Ya estaba en «${name}»`);
  },

  async [EVENTS.REMOVE_FROM_LIST](ctx, { id, path }) {
    const result = await ctx.library.removeFromList(id, path);
    if (!result.ok) return ctx.toast.show(result.error, { tone: 'error' });
    applyLists(ctx, result.lists);
  },
};
