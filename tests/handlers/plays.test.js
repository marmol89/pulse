import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import plays from '../../src/renderer/mediator/handlers/plays.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { resolveCollection } from '../../src/renderer/mediator/actions.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const titles = (collection) => collection.tracks.map((track) => track.title);

describe('handlers/plays', () => {
  test('al arrancar trae las escuchas y Inicio muestra las listas inteligentes que tienen canciones', async () => {
    const ctx = fakeContext();
    ctx.catalog.add(tracks('a', 'b', 'c'));
    const [a, b] = tracks('a', 'b');
    ctx.library = spy({ plays: { [a.path]: 3, [b.path]: 1 } });
    await plays[EVENTS.APP_READY](ctx);
    const [{ smart }] = callsOf(ctx.home.render).at(-1);
    assert.deepEqual(smart.map(({ kind, count }) => [kind, count]), [['most-played', 2], ['unplayed', 1]]);
    assert.deepEqual(titles(resolveCollection(ctx, { kind: 'most-played' })), ['a', 'b']);
    assert.deepEqual(titles(resolveCollection(ctx, { kind: 'unplayed' })), ['c']);
  });

  test('cuenta la que suena una vez, cuando se ha escuchado lo bastante, y la guarda en el bucket', async () => {
    const ctx = fakeContext({ library: spy({ addPlay: (path) => ({ ok: true, plays: { [path]: 7 } }) }) });
    ctx.catalog.add(tracks('a'));
    ctx.playlist.setQueue(tracks('a'));
    const [a] = tracks('a');
    plays[EVENTS.TRACK_STARTED](ctx);
    for (let time = 0; time <= 8; time += 0.5) await plays[EVENTS.TIME_UPDATE](ctx, { current: time, duration: 10 });
    assert.deepEqual(callsOf(ctx.library.addPlay), [[a.path]]);
    assert.equal(ctx.plays.count(a.path), 7, 'se queda con lo que confirma el bucket');
  });

  test('las de otro equipo repintan Inicio y la lista inteligente abierta', () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'most-played' } }) });
    ctx.catalog.add(tracks('a'));
    const [a] = tracks('a');
    plays[EVENTS.PLAYS_CHANGED](ctx, { [a.path]: 2 });
    assert.equal(ctx.home.render.mock.callCount(), 1);
    assert.deepEqual(titles(callsOf(ctx.playlistView.render)[0][0]), ['a']);
  });
});
