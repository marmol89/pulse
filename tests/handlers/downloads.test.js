import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import downloads from '../../src/renderer/mediator/handlers/downloads.js';
import { Downloads } from '../../src/renderer/colleagues/Downloads.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { formatBytes } from '../../src/renderer/ui/format.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const summary = (paths = [], pending = [], bytes = 0) => ({ paths, pending, bytes });
const list = { id: 'l1', name: 'Coche', tracks: ['a', 'b'], createdAt: 1, updatedAt: 1 };
const downloadState = (ctx) => callsOf(ctx.playlistView.render).at(-1)[0] && callsOf(ctx.playlistView.render).at(-1)[1].download;

function withList(library) {
  const ctx = fakeContext({ library: spy({ canDownload: true, ...library }), playlistView: spy({ source: { kind: 'list', id: 'l1' } }) });
  ctx.catalog.add(tracks('a', 'b', 'c'));
  ctx.lists.set([list]);
  return ctx;
}

describe('Downloads', () => {
  test('dice si una colección está descargada, descargándose o no', () => {
    const model = new Downloads();
    assert.equal(model.supported(), false);
    model.set(summary(['a', 'b'], ['c'], 2048));
    assert.equal(model.supported(), true);
    assert.equal(model.stateOf(['a', 'b']), 'all');
    assert.equal(model.stateOf(['a', 'c']), 'downloading');
    assert.equal(model.stateOf(['a', 'z']), 'none');
    assert.equal(model.stateOf([]), 'none');
    assert.deepEqual(model.summary(), { count: 2, bytes: 2048, pending: 1 });
  });

  test('formatBytes() escribe tamaños legibles', () => {
    assert.deepEqual([formatBytes(0), formatBytes(870_000), formatBytes(12 * 1024 * 1024), formatBytes(1.4 * 1024 ** 3)], ['0 KB', '850 KB', '12 MB', '1,4 GB']);
  });
});

describe('handlers/downloads', () => {
  test('sin descargas en la plataforma (Electron) no hay botón ni fila en "Tu música"', async () => {
    const ctx = fakeContext({ playlistView: spy({ source: { kind: 'list', id: 'l1' } }) });
    await downloads[EVENTS.APP_READY](ctx);
    assert.equal(ctx.router.setDownloads.mock.callCount(), 0);
    assert.equal(ctx.library.getDownloads.mock.callCount(), 0);
  });

  test('al arrancar muestra lo descargado y el estado de la colección abierta', async () => {
    const ctx = withList({ getDownloads: summary(['a', 'b'], [], 3 * 1024 * 1024) });
    await downloads[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.router.setDownloads), [[{ count: 2, bytes: 3 * 1024 * 1024, pending: 0 }]]);
    assert.equal(downloadState(ctx), 'all');
  });

  test('descargar una lista pide sus canciones, avisa y, al terminar, lo dice', async () => {
    const ctx = withList({ getDownloads: summary(), downloadTracks: summary([], ['a', 'b']) });
    await downloads[EVENTS.APP_READY](ctx);

    await downloads[EVENTS.DOWNLOAD_COLLECTION](ctx, { kind: 'list', id: 'l1' });
    assert.deepEqual(callsOf(ctx.library.downloadTracks), [[['a', 'b']]]);
    assert.equal(downloadState(ctx), 'downloading');

    downloads[EVENTS.DOWNLOADS_CHANGED](ctx, summary(['a'], ['b'], 10));
    downloads[EVENTS.DOWNLOADS_CHANGED](ctx, summary(['a', 'b'], [], 20));
    assert.equal(downloadState(ctx), 'all');
    assert.deepEqual(callsOf(ctx.toast.show), [['Descargando 2 canciones…'], ['Descargas terminadas: se pueden escuchar sin conexión']]);
  });

  test('si alguna falla, el aviso final lo dice', async () => {
    const ctx = withList({ getDownloads: summary([], ['a']) });
    await downloads[EVENTS.APP_READY](ctx);
    downloads[EVENTS.DOWNLOADS_CHANGED](ctx, { ...summary(), failed: ['a'] });
    assert.deepEqual(callsOf(ctx.toast.show), [['No se pudo descargar 1 canción', { tone: 'error' }]]);
  });

  test('quitar la descarga de la colección y borrarlas todas', async () => {
    const ctx = withList({ removeDownloads: summary(['c']), clearDownloads: summary() });
    await downloads[EVENTS.REMOVE_DOWNLOADS](ctx, { kind: 'list', id: 'l1' });
    assert.deepEqual(callsOf(ctx.library.removeDownloads), [[['a', 'b']]]);
    await downloads[EVENTS.CLEAR_DOWNLOADS](ctx);
    assert.deepEqual(callsOf(ctx.router.setDownloads).at(-1), [{ count: 0, bytes: 0, pending: 0 }]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Descarga quitada del móvil'], ['Descargas borradas']]);
  });
});
