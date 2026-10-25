import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import trash from '../../src/renderer/mediator/handlers/trash.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const item = { key: 'papelera/a.mp3', name: 'a.mp3', size: 10, deletedAt: 1 };

function withTracks(library) {
  const ctx = fakeContext({ library: spy(library) });
  ctx.catalog.add(tracks('a', 'b'));
  return ctx;
}

describe('handlers/trash', () => {
  test('"Eliminar del bucket" primero pide confirmación', () => {
    const ctx = withTracks({});
    trash[EVENTS.TRASH_TRACK](ctx, 'a');
    assert.equal(callsOf(ctx.trashDialog.openConfirm)[0][0].path, 'a');
    assert.equal(ctx.library.trashTrack.mock.callCount(), 0);
    trash[EVENTS.TRASH_TRACK](ctx, 'no-existe');
    assert.equal(ctx.trashDialog.openConfirm.mock.callCount(), 1);
  });

  test('al confirmar la mueve a la papelera y la quita de la biblioteca', async () => {
    const ctx = withTracks({ trashTrack: { ok: true, removed: ['a'] } });
    await trash[EVENTS.CONFIRM_TRASH](ctx, 'a');
    assert.deepEqual(callsOf(ctx.library.trashTrack), [['a']]);
    assert.equal(ctx.catalog.get('a'), null);
    assert.ok(ctx.catalog.get('b'));
    assert.equal(ctx.trashDialog.close.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.toast.show), [['Movida a la papelera del bucket']]);
  });

  test('si no se puede (claves de solo lectura), lo dice en el diálogo y la canción se queda', async () => {
    const ctx = withTracks({ trashTrack: { ok: false, error: 'Sin permiso' } });
    await trash[EVENTS.CONFIRM_TRASH](ctx, 'a');
    assert.deepEqual(callsOf(ctx.trashDialog.showError), [['Sin permiso']]);
    assert.ok(ctx.catalog.get('a'));
    assert.equal(ctx.trashDialog.close.mock.callCount(), 0);
  });

  test('la papelera se abre al momento y se rellena; restaurar y vaciar la repintan', async () => {
    const ctx = withTracks({ getTrash: { ok: true, items: [item] }, restoreFromTrash: { ok: true, items: [] }, emptyTrash: { ok: true, removed: 2, items: [] } });
    await trash[EVENTS.OPEN_TRASH](ctx);
    assert.deepEqual(callsOf(ctx.trashDialog.openTrash), [[null]]);
    assert.deepEqual(callsOf(ctx.trashDialog.showItems), [[[item]]]);

    await trash[EVENTS.RESTORE_FROM_TRASH](ctx, item.key);
    assert.deepEqual(callsOf(ctx.library.restoreFromTrash), [[item.key]]);
    await trash[EVENTS.EMPTY_TRASH](ctx);
    assert.deepEqual(callsOf(ctx.toast.show), [['Restaurada: vuelve a estar en tu biblioteca'], ['2 canciones borradas para siempre']]);
  });

  test('si no se puede leer la papelera, el error va al diálogo', async () => {
    const ctx = withTracks({ getTrash: { ok: false, error: 'Sin conexión' } });
    await trash[EVENTS.OPEN_TRASH](ctx);
    assert.deepEqual(callsOf(ctx.trashDialog.showError), [['Sin conexión']]);
  });
});
