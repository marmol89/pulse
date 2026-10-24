import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import uploads from '../../src/renderer/mediator/handlers/uploads.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';

const done = (fields) => ({ ok: true, total: 1, uploaded: 1, skipped: 0, failed: [], ...fields });

describe('handlers/uploads', () => {
  test('upload-songs sube lo elegido y resume el resultado', async () => {
    const ctx = fakeContext({ library: spy({ chooseAndUpload: async () => done({ total: 3, uploaded: 2, skipped: 1 }) }) });
    await uploads[EVENTS.UPLOAD_SONGS](ctx);
    assert.deepEqual(callsOf(ctx.toast.show), [['2 canciones subidas · 1 ya estaba en el bucket', { tone: 'info' }]]);
  });

  test('si se cancela el diálogo no avisa de nada', async () => {
    const ctx = fakeContext({ library: spy({ chooseAndUpload: async () => null }) });
    await uploads[EVENTS.UPLOAD_SONGS](ctx);
    assert.equal(ctx.toast.show.mock.callCount(), 0);
  });

  test('files-dropped sube lo arrastrado', async () => {
    const files = [{ name: 'Selva.mp3' }];
    const ctx = fakeContext({ library: spy({ uploadFiles: async () => done() }) });
    await uploads[EVENTS.FILES_DROPPED](ctx, files);
    assert.deepEqual(callsOf(ctx.library.uploadFiles), [[files]]);
    assert.deepEqual(callsOf(ctx.toast.show), [['1 canción subida', { tone: 'info' }]]);
  });

  test('sin audio en lo arrastrado, lo explica', async () => {
    const ctx = fakeContext({ library: spy({ uploadFiles: async () => done({ total: 0, uploaded: 0 }) }) });
    await uploads[EVENTS.FILES_DROPPED](ctx, [{ name: 'notas.txt' }]);
    assert.deepEqual(callsOf(ctx.toast.show), [['No hay canciones de audio en lo que has elegido', { tone: 'error' }]]);
  });

  test('si todo falla, avisa en rojo con el motivo', async () => {
    const error = 'Tus claves no tienen permiso para subir canciones a este bucket';
    const ctx = fakeContext({ library: spy({ chooseAndUpload: async () => done({ total: 2, uploaded: 0, failed: [{ name: 'a.mp3', error }, { name: 'b.mp3', error }] }) }) });
    await uploads[EVENTS.UPLOAD_SONGS](ctx);
    assert.deepEqual(callsOf(ctx.toast.show), [[`2 no se pudieron subir: ${error}`, { tone: 'error' }]]);
  });

  test('un solo fallo entre subidas se nombra', async () => {
    const ctx = fakeContext({ library: spy({ chooseAndUpload: async () => done({ total: 2, failed: [{ name: 'b.mp3', error: 'No se pudo conectar con el servidor' }] }) }) });
    await uploads[EVENTS.UPLOAD_SONGS](ctx);
    assert.deepEqual(callsOf(ctx.toast.show), [['1 canción subida · «b.mp3» no se pudo subir: No se pudo conectar con el servidor', { tone: 'info' }]]);
  });

  test('sin conexión avisa y abre el formulario de conexión', async () => {
    const ctx = fakeContext({
      library: spy({ uploadFiles: async () => ({ ok: false, needsConnection: true, error: 'Conecta tu bucket antes de subir canciones' }) }),
    });
    await uploads[EVENTS.FILES_DROPPED](ctx, [{ name: 'a.mp3' }]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Conecta tu bucket antes de subir canciones', { tone: 'error' }]]);
    assert.deepEqual(callsOf(ctx.connection.open), [[null]]);
  });

  test('si falla la llamada al proceso main, avisa', async () => {
    const ctx = fakeContext({ library: spy({ chooseAndUpload: async () => Promise.reject(new Error('IPC')) }) });
    await uploads[EVENTS.UPLOAD_SONGS](ctx);
    assert.deepEqual(callsOf(ctx.toast.show), [['No se pudieron subir las canciones', { tone: 'error' }]]);
  });

  test('upload-progress muestra qué se está subiendo', () => {
    const ctx = fakeContext();
    uploads[EVENTS.UPLOAD_PROGRESS](ctx, { current: 2, total: 5, name: 'Selva.mp3' });
    uploads[EVENTS.UPLOAD_PROGRESS](ctx, { current: 1, total: 1, name: 'Selva.mp3' });
    assert.deepEqual(callsOf(ctx.toast.show), [
      ['Subiendo 2 de 5: «Selva.mp3»…', { sticky: true }],
      ['Subiendo «Selva.mp3»…', { sticky: true }],
    ]);
  });
});
