import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import m3uLists from '../../src/renderer/mediator/handlers/m3uLists.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const list = (id, name, paths = []) => ({ id, name, tracks: paths, createdAt: 1, updatedAt: 1 });

describe('handlers/m3uLists', () => {
  test('exportar una lista manda su nombre y sus canciones, y avisa al guardarla', async () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b'));
    ctx.lists.set([list('l1', 'Correr', ['b', 'a'])]);

    await m3uLists[EVENTS.EXPORT_COLLECTION](ctx, { kind: 'list', id: 'l1' });

    const [[name, exported]] = callsOf(ctx.library.exportPlaylist);
    assert.equal(name, 'Correr');
    assert.deepEqual(exported.map((track) => track.path), ['b', 'a']);
    assert.deepEqual(callsOf(ctx.toast.show), [['«Correr» exportada (2 canciones)']]);
  });

  test('cancelar el diálogo no avisa; un error sí; una colección vacía ni lo abre', async () => {
    const ctx = fakeContext({ library: spy({ exportPlaylist: { saved: false } }) });
    ctx.catalog.add(tracks('a'));
    ctx.lists.set([list('l1', 'Correr', ['a']), list('l2', 'Vacía')]);
    await m3uLists[EVENTS.EXPORT_COLLECTION](ctx, { kind: 'list', id: 'l1' });
    assert.equal(ctx.toast.show.mock.callCount(), 0);

    ctx.library = spy({ exportPlaylist: { saved: false, error: 'No se pudo guardar' } });
    await m3uLists[EVENTS.EXPORT_COLLECTION](ctx, { kind: 'list', id: 'l1' });
    await m3uLists[EVENTS.EXPORT_COLLECTION](ctx, { kind: 'list', id: 'l2' });
    assert.deepEqual(callsOf(ctx.toast.show), [['No se pudo guardar', { tone: 'error' }], ['No hay canciones que exportar']]);
    assert.equal(ctx.library.exportPlaylist.mock.callCount(), 1);
  });

  test('importar crea la lista con las canciones encontradas, la abre y cuenta las que faltan', async () => {
    const created = list('l2', 'Correr (2)', ['a']);
    const ctx = fakeContext({
      library: spy({ importPlaylist: { name: 'Correr', paths: ['a'], missing: ['x', 'y'] }, createList: { ok: true, lists: [list('l1', 'Correr'), created], id: 'l2' } }),
    });
    ctx.catalog.add(tracks('a'));
    ctx.lists.set([list('l1', 'Correr')]);

    await m3uLists[EVENTS.IMPORT_LIST](ctx);

    assert.equal(callsOf(ctx.library.importPlaylist)[0][0].length, 1, 'busca en toda la biblioteca');
    assert.deepEqual(callsOf(ctx.library.createList), [['Correr (2)', ['a']]]);
    assert.deepEqual(callsOf(ctx.router.show), [['collection', 'list:l2']]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Lista importada con 1 canción; faltan 2 que no están en tu biblioteca']]);
  });

  test('cancelar no hace nada; sin ninguna canción de la biblioteca no se crea la lista', async () => {
    const ctx = fakeContext();
    await m3uLists[EVENTS.IMPORT_LIST](ctx);
    ctx.library = spy({ importPlaylist: { name: 'Otra', paths: [], missing: ['x'] } });
    await m3uLists[EVENTS.IMPORT_LIST](ctx);
    assert.equal(ctx.library.createList.mock.callCount(), 0);
    assert.deepEqual(callsOf(ctx.toast.show), [['Ninguna canción de esa lista está en tu biblioteca', { tone: 'error' }]]);
  });
});
