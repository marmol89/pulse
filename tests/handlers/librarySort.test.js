import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import librarySort from '../../src/renderer/mediator/handlers/librarySort.js';
import navigation from '../../src/renderer/mediator/handlers/navigation.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track } from '../helpers/tracks.js';

const songs = [track('a', { title: 'Brisa', addedAt: 1 }), track('b', { title: 'Alba', addedAt: 2 }), track('c', { title: 'Cima', artist: 'Kora', addedAt: 3 })];
const rendered = (ctx) => callsOf(ctx.playlistView.render).map(([collection]) => collection.tracks.map((item) => item.path));

describe('handlers/librarySort', () => {
  test('ordenar recuerda el orden y repinta la biblioteca si se está viendo', () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'library', filter: '' } }) });
    ctx.catalog.add(songs);

    librarySort[EVENTS.SORT_LIBRARY](ctx, 'title');

    assert.equal(ctx.settings.librarySort(), 'title');
    assert.deepEqual(rendered(ctx), [['b', 'a', 'c']]);
    assert.equal(callsOf(ctx.playlistView.render)[0][0].source.sort, 'title');
  });

  test('en otra colección, ordenar solo lo recuerda; filtrar no hace nada', () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'album', key: 'x' } }) });
    librarySort[EVENTS.SORT_LIBRARY](ctx, 'year');
    librarySort[EVENTS.FILTER_LIBRARY](ctx, 'kora');
    assert.equal(ctx.settings.librarySort(), 'year');
    assert.equal(ctx.playlistView.render.mock.callCount(), 0);
  });

  test('filtrar repinta solo las que coinciden y lo que suena es lo filtrado', () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'library' } }) });
    ctx.catalog.add(songs);

    librarySort[EVENTS.FILTER_LIBRARY](ctx, 'kora');
    const [[collection]] = callsOf(ctx.playlistView.render);
    assert.deepEqual(rendered(ctx), [['c']]);
    assert.equal(collection.source.filter, 'kora');

    navigation[EVENTS.PLAY_COLLECTION](ctx, collection.source);
    assert.deepEqual(ctx.playlist.tracks().map((item) => item.path), ['c']);
  });
});
