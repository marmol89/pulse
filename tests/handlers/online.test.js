import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import online from '../../src/renderer/mediator/handlers/online.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { track } from '../helpers/tracks.js';

const despacito = track('/m/despacito.mp3', { title: 'Despacito', artist: 'Luis Fonsi' });
const completed = { ...despacito, album: 'VIDA', year: 2017, cover: 'media://cover/x?v=1', online: { status: 'found', source: 'iTunes' } };

function playing(fields = {}) {
  const ctx = fakeContext(fields);
  ctx.catalog.add([despacito]);
  ctx.playlist.setQueue([despacito]);
  return ctx;
}

const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);

describe('handlers/online', () => {
  test('app-ready aplica la preferencia guardada al proceso main y a la sidebar', () => {
    const ctx = fakeContext();
    online[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.library.setOnlineLookup), [[true]]);
    assert.deepEqual(callsOf(ctx.router.setOnlineLookup), [[true]]);
  });

  test('set-online-lookup guarda la preferencia, la aplica y avisa', () => {
    const ctx = fakeContext();
    online[EVENTS.SET_ONLINE_LOOKUP](ctx, false);
    assert.equal(ctx.settings.onlineLookup(), false);
    assert.deepEqual(callsOf(ctx.library.setOnlineLookup), [[false]]);
    assert.deepEqual(callsOf(ctx.router.setOnlineLookup), [[false]]);
    assert.deepEqual(toasts(ctx), ['Búsqueda en internet desactivada']);
  });

  test('track-started completa la pista que suena y la muestra en todas las vistas', async () => {
    const ctx = playing({ library: spy({ lookup: async () => ({ track: completed, changed: true }) }) });

    await online[EVENTS.TRACK_STARTED](ctx);

    assert.deepEqual(callsOf(ctx.library.lookup), [[despacito.path]]);
    assert.equal(ctx.catalog.get(despacito.path), completed);
    assert.equal(ctx.playlist.current(), completed);
    assert.deepEqual(callsOf(ctx.controls.show), [[completed, false]]);
    assert.deepEqual(callsOf(ctx.nowPlaying.show), [[completed, false]]);
    assert.deepEqual(callsOf(ctx.mediaSession.show), [[completed]]);
    for (const view of [ctx.playlistView, ctx.search, ctx.home]) assert.deepEqual(callsOf(view.updateTrack), [[completed, false]]);
    assert.equal(ctx.home.render.mock.callCount(), 1);
  });

  test('track-started no busca si la búsqueda está desactivada', async () => {
    const ctx = playing();
    ctx.settings.setOnlineLookup(false);
    await online[EVENTS.TRACK_STARTED](ctx);
    assert.equal(ctx.library.lookup.mock.callCount(), 0);
  });

  test('track-started sin cambios o sin conexión no toca las vistas ni avisa', async () => {
    const unchanged = playing({ library: spy({ lookup: async () => ({ track: despacito, changed: false }) }) });
    await online[EVENTS.TRACK_STARTED](unchanged);
    assert.equal(unchanged.controls.show.mock.callCount(), 0);

    const offline = playing({
      library: spy({
        lookup: async () => {
          throw new Error('sin red');
        },
      }),
    });
    await online[EVENTS.TRACK_STARTED](offline);
    assert.equal(offline.toast.show.mock.callCount(), 0);
  });

  test('lookup-track fuerza la búsqueda, muestra "buscando" y avisa del resultado', async () => {
    const ctx = playing({ library: spy({ lookup: async () => ({ track: completed, changed: true }) }) });

    await online[EVENTS.LOOKUP_TRACK](ctx, despacito.path);

    assert.deepEqual(callsOf(ctx.library.lookup), [[despacito.path, { force: true }]]);
    assert.deepEqual(callsOf(ctx.nowPlaying.setLookupState), [['loading'], ['idle']]);
    assert.deepEqual(toasts(ctx), ['Información actualizada desde internet']);
    assert.equal(ctx.playlist.current(), completed);
  });

  test('lookup-track avisa si no la encuentra o si no hay conexión', async () => {
    const notFound = playing({ library: spy({ lookup: async () => ({ track: { ...despacito, online: { status: 'not-found' } }, changed: true }) }) });
    await online[EVENTS.LOOKUP_TRACK](notFound, despacito.path);
    assert.deepEqual(toasts(notFound), ['No se encontró esta canción en internet']);

    const offline = playing({
      library: spy({
        lookup: async () => {
          throw new Error('sin red');
        },
      }),
    });
    await online[EVENTS.LOOKUP_TRACK](offline, despacito.path);
    assert.deepEqual(toasts(offline), ['No se pudo conectar. Inténtalo más tarde']);
    assert.deepEqual(callsOf(offline.nowPlaying.setLookupState), [['loading'], ['idle']]);
  });

  test('tracks-updated reparte el lote; solo la pista que suena va a la player bar', () => {
    const ctx = playing();
    const other = { ...track('/m/otra.mp3'), album: 'Otro' };

    online[EVENTS.TRACKS_UPDATED](ctx, [other, completed]);

    assert.equal(ctx.catalog.get(other.path), other);
    assert.deepEqual(callsOf(ctx.controls.show), [[completed, false]]);
    assert.deepEqual(callsOf(ctx.playlistView.updateTrack), [[other, false], [completed, false]]);
    assert.equal(ctx.home.render.mock.callCount(), 1);
  });
});
