import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import folders from '../../src/renderer/mediator/handlers/folders.js';
import connection from '../../src/renderer/mediator/handlers/connection.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { trackListState } from '../../src/renderer/mediator/actions.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

const MUSIC = { id: 'C:\\Users\\ana\\Música', name: 'C:\\Users\\ana\\Música' };
const summary = { mode: 'local', folders: [MUSIC] };

describe('handlers/folders', () => {
  test('choose-folder añade al formulario la carpeta elegida; cancelar no hace nada', async () => {
    const ctx = fakeContext({ library: spy({ chooseFolder: async () => MUSIC }) });
    await folders[EVENTS.CHOOSE_FOLDER](ctx);
    assert.deepEqual(callsOf(ctx.connection.addFolder), [[MUSIC]]);

    const canceled = fakeContext({ library: spy({ chooseFolder: async () => null }) });
    await folders[EVENTS.CHOOSE_FOLDER](canceled);
    assert.equal(canceled.connection.addFolder.mock.callCount(), 0);

    const failed = fakeContext({ library: spy({ chooseFolder: async () => Promise.reject(new Error('sin permiso')) }) });
    await folders[EVENTS.CHOOSE_FOLDER](failed);
    assert.deepEqual(callsOf(failed.connection.showError), [['No se pudo abrir esa carpeta']]);
  });

  test('save-folders usa las carpetas: cierra, avisa, pasa a solo lectura y sincroniza', async () => {
    const ctx = fakeContext({ library: spy({ saveFolders: async () => ({ ok: true, summary, count: 12 }), sync: async () => ({ added: 12, removed: 0 }) }) });
    await folders[EVENTS.SAVE_FOLDERS](ctx, [MUSIC.id]);

    assert.deepEqual(callsOf(ctx.library.saveFolders), [[[MUSIC.id]]]);
    assert.deepEqual(callsOf(ctx.connection.setBusy), [[true], [false]]);
    assert.equal(ctx.connection.close.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.router.setConnection), [[summary]]);
    assert.equal(callsOf(ctx.toast.show)[0][0], 'Usando tus carpetas: 12 canciones');
    assert.equal(ctx.settings.isReadOnly(), true);
    assert.equal(trackListState(ctx).readOnly, true, 'las listas de canciones dejan de ofrecer «Eliminar del bucket»');
    assert.equal(ctx.library.sync.mock.callCount(), 1);
  });

  test('si no se pueden leer, el formulario lo explica y no cambia nada', async () => {
    const ctx = fakeContext({ library: spy({ saveFolders: async () => ({ ok: false, error: 'No se encuentra la carpeta «USB»' }) }) });
    await folders[EVENTS.SAVE_FOLDERS](ctx, ['E:\\']);
    assert.deepEqual(callsOf(ctx.connection.showError), [['No se encuentra la carpeta «USB»']]);
    assert.equal(ctx.connection.close.mock.callCount(), 0);
    assert.equal(ctx.settings.source(), null);
    assert.equal(ctx.library.sync.mock.callCount(), 0);
  });

  test('al arrancar con carpetas, todo se pinta en solo lectura y no se pide conexión', async () => {
    const ctx = fakeContext({ library: spy({ connection: async () => summary }) });
    await connection[EVENTS.APP_READY](ctx);
    assert.equal(ctx.settings.source(), 'local');
    assert.equal(ctx.connection.open.mock.callCount(), 0);
    assert.equal(callsOf(ctx.home.render).at(-1)[0].readOnly, true);
  });
});
