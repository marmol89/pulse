import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import views from '../../src/renderer/mediator/handlers/views.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, callsOf } from '../helpers/fakeContext.js';
import { track, tracks } from '../helpers/tracks.js';

describe('handlers/views', () => {
  test('navigate a inicio o buscar cierra el overlay y muestra la vista', () => {
    const ctx = fakeContext();
    views[EVENTS.NAVIGATE](ctx, 'home');
    views[EVENTS.NAVIGATE](ctx, 'search');
    assert.deepEqual(callsOf(ctx.router.show), [['home'], ['search']]);
    assert.equal(ctx.router.closeOverlay.mock.callCount(), 2);
    assert.equal(ctx.search.focus.mock.callCount(), 1);
  });

  test('navigate a biblioteca abre la colección de toda la biblioteca', () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b'));

    views[EVENTS.NAVIGATE](ctx, 'library');

    assert.equal(callsOf(ctx.playlistView.render)[0][0].title, 'Tu biblioteca');
    assert.deepEqual(callsOf(ctx.router.show), [['collection', 'library']]);
  });

  test('open-collection pinta la colección pedida', () => {
    const ctx = fakeContext();
    ctx.catalog.add([track('a', { genre: 'Lo-fi' }), track('b')]);

    views[EVENTS.OPEN_COLLECTION](ctx, { kind: 'genre', key: 'Lo-fi' });

    const [[collection]] = callsOf(ctx.playlistView.render);
    assert.equal(collection.title, 'Lo-fi');
    assert.equal(collection.tracks.length, 1);
    assert.deepEqual(callsOf(ctx.router.show), [['collection', null]]);
  });

  test('navigate-back vuelve a la vista anterior', () => {
    const ctx = fakeContext();
    views[EVENTS.NAVIGATE_BACK](ctx);
    assert.equal(ctx.router.back.mock.callCount(), 1);
  });

  test('open-now-playing solo abre el overlay si hay una pista en la cola', () => {
    const ctx = fakeContext();
    views[EVENTS.OPEN_NOW_PLAYING](ctx);
    assert.equal(ctx.router.openOverlay.mock.callCount(), 0);

    ctx.playlist.setQueue(tracks('a'));
    views[EVENTS.OPEN_NOW_PLAYING](ctx);
    assert.equal(ctx.router.openOverlay.mock.callCount(), 1);

    views[EVENTS.CLOSE_NOW_PLAYING](ctx);
    assert.equal(ctx.router.closeOverlay.mock.callCount(), 1);
  });

  test('search muestra los resultados del catálogo', () => {
    const ctx = fakeContext();
    const selva = track('/selva.mp3', { title: 'Selva' });
    ctx.catalog.add([selva, track('/ola.mp3', { title: 'Ola Azul' })]);

    views[EVENTS.SEARCH](ctx, 'selva');

    const [[query, results, state]] = callsOf(ctx.search.showResults);
    assert.equal(query, 'selva');
    assert.deepEqual(results, [selva]);
    assert.equal(state.currentPath, null);
  });
});
