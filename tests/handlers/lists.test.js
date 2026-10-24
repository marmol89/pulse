import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import lists from '../../src/renderer/mediator/handlers/lists.js';
import listTracks from '../../src/renderer/mediator/handlers/listTracks.js';
import navigation from '../../src/renderer/mediator/handlers/navigation.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const list = (id, name, paths = []) => ({ id, name, tracks: paths, createdAt: 1, updatedAt: 1 });
const ok = (all, extra = {}) => ({ ok: true, lists: all, ...extra });

describe('handlers/lists', () => {
  test('app-ready carga las listas en el modelo, la sidebar e Inicio (con las pistas que siguen en la biblioteca)', async () => {
    const ctx = fakeContext({ library: spy({ lists: [list('l1', 'Correr', ['a', 'borrada'])] }) });
    ctx.catalog.add(tracks('a'));

    await lists[EVENTS.APP_READY](ctx);

    assert.equal(ctx.lists.get('l1').name, 'Correr');
    assert.deepEqual(callsOf(ctx.router.setLists), [[ctx.lists.all()]]);
    const [[home]] = callsOf(ctx.home.render);
    assert.deepEqual(home.lists.map(({ id, name, count }) => ({ id, name, count })), [{ id: 'l1', name: 'Correr', count: 1 }]);
  });

  test('crear una lista vacía la abre; con canciones se queda donde estaba y avisa', async () => {
    const created = list('l1', 'Correr');
    const ctx = fakeContext({ library: spy({ createList: ok([created], { id: 'l1' }) }) });

    await lists[EVENTS.CREATE_LIST](ctx, { name: 'Correr' });
    assert.equal(ctx.listDialog.close.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.router.show), [['collection', 'list:l1']]);
    assert.equal(callsOf(ctx.playlistView.render)[0][0].title, 'Correr');

    ctx.library = spy({ createList: ok([{ ...created, tracks: ['a'] }], { id: 'l1' }) });
    await lists[EVENTS.CREATE_LIST](ctx, { name: 'Correr', paths: ['a'] });
    assert.deepEqual(callsOf(ctx.toast.show), [['Lista «Correr» creada con 1 canción']]);
    assert.equal(ctx.router.show.mock.callCount(), 1);
  });

  test('si el proceso main rechaza el nombre, el error se ve en el diálogo', async () => {
    const ctx = fakeContext({ library: spy({ createList: { ok: false, error: 'Ponle un nombre a la lista' } }) });
    await lists[EVENTS.CREATE_LIST](ctx, { name: ' ' });
    assert.deepEqual(callsOf(ctx.listDialog.showError), [['Ponle un nombre a la lista']]);
    assert.equal(ctx.listDialog.close.mock.callCount(), 0);
  });

  test('editar abre el diálogo con la lista; renombrar y eliminar la reflejan', async () => {
    const ctx = fakeContext({ library: spy({ renameList: ok([list('l1', 'Nuevo')]), deleteList: ok([]) }) });
    ctx.lists.set([list('l1', 'Viejo')]);
    lists[EVENTS.EDIT_LIST](ctx, 'l1');
    assert.equal(callsOf(ctx.listDialog.openEdit)[0][0].name, 'Viejo');

    await lists[EVENTS.RENAME_LIST](ctx, { id: 'l1', name: 'Nuevo' });
    assert.equal(ctx.lists.get('l1').name, 'Nuevo');

    await lists[EVENTS.DELETE_LIST](ctx, 'l1');
    assert.deepEqual(ctx.lists.all(), []);
    assert.deepEqual(callsOf(ctx.toast.show), [['Lista «Nuevo» eliminada']]);
  });

  test('si eliminan desde otro equipo la lista que se está viendo, se vuelve atrás', () => {
    const ctx = fakeContext({
      playlistView: spy({ source: { kind: 'list', id: 'l1' } }),
      router: spy({ current: 'collection' }),
    });
    ctx.lists.set([list('l1', 'Compartida')]);
    lists[EVENTS.LISTS_CHANGED](ctx, [list('l1', 'Renombrada')]);
    assert.equal(callsOf(ctx.playlistView.render)[0][0].title, 'Renombrada', 'si sigue, se repinta');

    lists[EVENTS.LISTS_CHANGED](ctx, []);
    assert.equal(ctx.router.back.mock.callCount(), 1);
  });

  test('una lista suena como cualquier colección', () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b'));
    ctx.lists.set([list('l1', 'Correr', ['b', 'a'])]);
    navigation[EVENTS.PLAY_COLLECTION](ctx, { kind: 'list', id: 'l1' });
    assert.deepEqual(ctx.playlist.tracks().map((track) => track.path), ['b', 'a']);
    assert.deepEqual(callsOf(ctx.nowPlaying.setContext), [['Correr']]);
  });
});

describe('handlers/listTracks', () => {
  test('elegir lista abre el selector con la pista indicada o la que suena; sin ninguna, nada', () => {
    const ctx = fakeContext();
    ctx.lists.set([list('l1', 'Correr')]);
    listTracks[EVENTS.CHOOSE_LIST](ctx);
    assert.equal(ctx.listDialog.openPicker.mock.callCount(), 0);

    listTracks[EVENTS.CHOOSE_LIST](ctx, 'a');
    ctx.playlist.setQueue(tracks('b'));
    listTracks[EVENTS.CHOOSE_LIST](ctx);
    assert.deepEqual(callsOf(ctx.listDialog.openPicker), [
      [ctx.lists.all(), ['a']],
      [ctx.lists.all(), ['b']],
    ]);
  });

  test('añadir avisa de si estaba ya', async () => {
    const ctx = fakeContext({ library: spy({ addToList: ok([list('l1', 'Correr', ['a'])]) }) });
    ctx.lists.set([list('l1', 'Correr')]);
    await listTracks[EVENTS.ADD_TO_LIST](ctx, { id: 'l1', paths: ['a'] });
    await listTracks[EVENTS.ADD_TO_LIST](ctx, { id: 'l1', paths: ['a'] });
    assert.deepEqual(callsOf(ctx.toast.show), [['Añadida a «Correr»'], ['Ya estaba en «Correr»']]);
    assert.equal(ctx.listDialog.close.mock.callCount(), 2);
  });

  test('quitar repinta la lista abierta; si falla, avisa', async () => {
    const ctx = fakeContext({
      library: spy({ removeFromList: ok([list('l1', 'Correr', [])]) }),
      playlistView: spy({ source: { kind: 'list', id: 'l1' } }),
    });
    ctx.lists.set([list('l1', 'Correr', ['a'])]);
    await listTracks[EVENTS.REMOVE_FROM_LIST](ctx, { id: 'l1', path: 'a' });
    assert.deepEqual(callsOf(ctx.playlistView.render)[0][0].tracks, []);

    ctx.library = spy({ removeFromList: { ok: false, error: 'Esa lista ya no existe' } });
    await listTracks[EVENTS.REMOVE_FROM_LIST](ctx, { id: 'l1', path: 'a' });
    assert.deepEqual(callsOf(ctx.toast.show), [['Esa lista ya no existe', { tone: 'error' }]]);
  });
});
