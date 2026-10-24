import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import connection from '../../src/renderer/mediator/handlers/connection.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

const summary = { endpoint: 'https://minio.ejemplo.com', accessKeyId: 'clave', bucket: 'app-musica', prefix: '' };
const input = { ...summary, secretAccessKey: 'secreto' };

describe('handlers/connection', () => {
  test('app-ready muestra la conexión guardada en la sidebar', async () => {
    const ctx = fakeContext({ library: spy({ connection: async () => summary }) });
    await connection[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.router.setConnection), [[summary]]);
    assert.equal(ctx.connection.open.mock.callCount(), 0);
  });

  test('la primera vez (sin conexión) abre el formulario', async () => {
    const ctx = fakeContext();
    await connection[EVENTS.APP_READY](ctx);
    assert.deepEqual(callsOf(ctx.router.setConnection), [[null]]);
    assert.deepEqual(callsOf(ctx.connection.open), [[null]]);
  });

  test('open-connection abre el formulario con la conexión guardada', async () => {
    const ctx = fakeContext({ library: spy({ connection: async () => summary }) });
    await connection[EVENTS.OPEN_CONNECTION](ctx);
    assert.deepEqual(callsOf(ctx.connection.open), [[summary]]);
  });

  test('save-connection conecta, cierra el formulario, avisa y sincroniza', async () => {
    const ctx = fakeContext({
      library: spy({ saveConnection: async () => ({ ok: true, summary, count: 1 }), sync: async () => ({ added: 1, removed: 0 }) }),
    });

    await connection[EVENTS.SAVE_CONNECTION](ctx, input);

    assert.deepEqual(callsOf(ctx.library.saveConnection), [[input]]);
    assert.deepEqual(callsOf(ctx.connection.setBusy), [[true], [false]]);
    assert.equal(ctx.connection.close.mock.callCount(), 1);
    assert.deepEqual(callsOf(ctx.router.setConnection), [[summary]]);
    assert.equal(callsOf(ctx.toast.show)[0][0], 'Conectado a «app-musica»');
    assert.equal(ctx.library.sync.mock.callCount(), 1);
  });

  test('si falla muestra el error en el formulario sin cerrarlo', async () => {
    const ctx = fakeContext({ library: spy({ saveConnection: async () => ({ ok: false, error: 'Ese bucket no existe' }) }) });
    await connection[EVENTS.SAVE_CONNECTION](ctx, input);
    assert.deepEqual(callsOf(ctx.connection.showError), [['Ese bucket no existe']]);
    assert.equal(ctx.connection.close.mock.callCount(), 0);
    assert.equal(ctx.library.sync.mock.callCount(), 0);
  });

  test('import-credentials conecta si basta o rellena el formulario si falta algo', async () => {
    const ok = fakeContext({ library: spy({ importCredentials: async () => ({ ok: true, summary, count: 3 }) }) });
    await connection[EVENTS.IMPORT_CREDENTIALS](ok);
    assert.equal(ok.connection.close.mock.callCount(), 1);

    const fields = { endpoint: summary.endpoint, accessKeyId: 'clave', bucket: '', prefix: '' };
    const partial = fakeContext({ library: spy({ importCredentials: async () => ({ ok: false, error: 'Indica el bucket: hay 2 (a, b)', fields }) }) });
    await connection[EVENTS.IMPORT_CREDENTIALS](partial);
    assert.deepEqual(callsOf(partial.connection.fill), [[fields]]);
    assert.deepEqual(callsOf(partial.connection.showError), [['Indica el bucket: hay 2 (a, b)']]);

    const canceled = fakeContext();
    await connection[EVENTS.IMPORT_CREDENTIALS](canceled);
    assert.equal(canceled.connection.showError.mock.callCount(), 0);
  });
});
