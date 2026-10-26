import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import editTrack from '../../src/renderer/mediator/handlers/editTrack.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/editTrack', () => {
  test('"Editar datos" abre el formulario con la pista de la biblioteca', () => {
    const ctx = fakeContext();
    const [track] = tracks('a');
    ctx.catalog.add([track]);
    editTrack[EVENTS.EDIT_TRACK](ctx, 'a');
    editTrack[EVENTS.EDIT_TRACK](ctx, 'no-esta');
    assert.deepEqual(callsOf(ctx.trackEditDialog.open), [[ctx.catalog.get('a')]]);
  });

  test('guardar manda el formulario, cierra y pinta la pista nueva en todas partes', async () => {
    const [track] = tracks('a');
    const edited = { ...track, album: 'Mío', edited: true };
    const ctx = fakeContext({ library: spy({ editTrack: { ok: true, track: edited } }) });
    ctx.catalog.add([track]);

    await editTrack[EVENTS.SAVE_TRACK_EDITS](ctx, { path: 'a', changes: { album: 'Mío' } });

    assert.deepEqual(callsOf(ctx.library.editTrack), [['a', { album: 'Mío' }]]);
    assert.equal(ctx.trackEditDialog.close.mock.callCount(), 1);
    assert.equal(ctx.catalog.get('a').album, 'Mío');
    assert.deepEqual(callsOf(ctx.toast.show), [['Datos guardados']]);
  });

  test('restaurar pide quitar lo editado; un error se queda en el formulario', async () => {
    const ctx = fakeContext({ library: spy({ editTrack: { ok: false, error: 'Esa canción ya no está en tu biblioteca' } }) });
    await editTrack[EVENTS.RESTORE_TRACK_DATA](ctx, 'a');
    assert.deepEqual(callsOf(ctx.library.editTrack), [['a', null]]);
    assert.deepEqual(callsOf(ctx.trackEditDialog.showError), [['Esa canción ya no está en tu biblioteca']]);
    assert.equal(ctx.trackEditDialog.close.mock.callCount(), 0);
    assert.equal(ctx.toast.show.mock.callCount(), 0);
  });
});
