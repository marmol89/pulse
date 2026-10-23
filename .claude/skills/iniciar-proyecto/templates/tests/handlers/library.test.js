import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import library from '../../src/renderer/mediator/handlers/library.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

const toasts = (ctx) => callsOf(ctx.toast.show).map(([message]) => message);

describe('handlers/library', () => {
  test('app-ready carga la biblioteca guardada y pinta Inicio', async () => {
    const ctx = fakeContext({ library: spy({ load: async () => tracks('a', 'b') }) });

    await library[EVENTS.APP_READY](ctx);

    assert.equal(ctx.catalog.size(), 2);
    assert.equal(callsOf(ctx.home.render)[0][0].isEmpty, false);
  });

  test('open-folder importa la carpeta elegida y avisa de cuántas canciones son nuevas', async () => {
    const ctx = fakeContext({
      library: spy({ chooseFolder: async () => '/musica', import: async () => tracks('a', 'b') }),
    });

    await library[EVENTS.OPEN_FOLDER](ctx);

    assert.deepEqual(callsOf(ctx.library.import), [[['/musica']]]);
    assert.equal(ctx.catalog.size(), 2);
    assert.deepEqual(toasts(ctx), ['Analizando tu música…', '2 canciones añadidas']);
  });

  test('cancelar el diálogo no importa nada', async () => {
    const ctx = fakeContext();
    await library[EVENTS.OPEN_FOLDER](ctx);
    await library[EVENTS.OPEN_FILES](ctx);
    assert.equal(ctx.library.import.mock.callCount(), 0);
    assert.equal(ctx.toast.show.mock.callCount(), 0);
  });

  test('open-files importa los archivos elegidos', async () => {
    const ctx = fakeContext({
      library: spy({ chooseFiles: async () => ['/a.mp3'], import: async () => tracks('/a.mp3') }),
    });
    await library[EVENTS.OPEN_FILES](ctx);
    assert.deepEqual(toasts(ctx).at(-1), '1 canción añadida');
  });

  test('files-dropped importa las rutas de los archivos soltados', async () => {
    const files = [{ name: 'a.mp3' }];
    const ctx = fakeContext({
      library: spy({ pathsForFiles: () => ['/a.mp3'], import: async () => [] }),
    });

    await library[EVENTS.FILES_DROPPED](ctx, files);

    assert.deepEqual(callsOf(ctx.library.pathsForFiles), [[files]]);
    assert.deepEqual(toasts(ctx).at(-1), 'No hay canciones nuevas');
  });

  test('tras importar vuelve a pintar la colección abierta', async () => {
    const ctx = fakeContext({
      library: spy({ chooseFolder: async () => '/m', import: async () => tracks('a') }),
      playlistView: spy({ source: { kind: 'library' } }),
    });

    await library[EVENTS.OPEN_FOLDER](ctx);

    assert.equal(callsOf(ctx.playlistView.render)[0][0].tracks.length, 1);
  });

  test('si la importación falla avisa y propaga el error al mediator', async () => {
    const ctx = fakeContext({
      library: spy({
        chooseFolder: async () => '/m',
        import: async () => {
          throw new Error('EACCES');
        },
      }),
    });

    await assert.rejects(library[EVENTS.OPEN_FOLDER](ctx), /EACCES/);
    assert.equal(toasts(ctx).at(-1), 'No se pudo importar la música');
  });
});
