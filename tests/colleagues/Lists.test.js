import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Lists } from '../../src/renderer/colleagues/Lists.js';
import { LibraryService } from '../../src/renderer/colleagues/LibraryService.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { recordingMediator } from '../helpers/FakeAudio.js';

const RUN = { id: 'l1', name: 'Para correr', tracks: ['s3://musica/a.mp3'], createdAt: 1, updatedAt: 1 };

describe('Lists', () => {
  test('guarda la última copia del proceso main y responde por id', () => {
    const lists = new Lists();
    assert.deepEqual(lists.all(), []);
    lists.set([RUN]);
    assert.equal(lists.get('l1').name, 'Para correr');
    assert.equal(lists.get('otra'), null);
    assert.equal(lists.includes('l1', 's3://musica/a.mp3'), true);
    assert.equal(lists.includes('l1', 's3://musica/b.mp3'), false);
    lists.set(null);
    assert.deepEqual(lists.all(), []);
  });
});

describe('LibraryService (listas)', () => {
  test('cada operación va a window.api y lists-changed llega al mediator', async () => {
    let push;
    const calls = [];
    const record = (name) => async (...args) => calls.push([name, ...args]) && { ok: true, lists: [RUN] };
    const library = new LibraryService({
      getLists: async () => [RUN],
      createList: record('create'),
      renameList: record('rename'),
      addToList: record('add'),
      removeFromList: record('remove'),
      deleteList: record('delete'),
      onListsChanged: (callback) => (push = callback),
    });
    const mediator = recordingMediator();
    library.setMediator(mediator);

    assert.deepEqual(await library.lists(), [RUN]);
    await library.createList('Nueva');
    await library.renameList('l1', 'Correr');
    await library.addToList('l1', ['s3://musica/b.mp3']);
    await library.removeFromList('l1', 's3://musica/a.mp3');
    await library.deleteList('l1');
    push([RUN]);

    assert.deepEqual(calls, [
      ['create', 'Nueva', []],
      ['rename', 'l1', 'Correr'],
      ['add', 'l1', ['s3://musica/b.mp3']],
      ['remove', 'l1', 's3://musica/a.mp3'],
      ['delete', 'l1'],
    ]);
    assert.deepEqual(mediator.events, [[EVENTS.LISTS_CHANGED, [RUN]]]);
  });
});

describe('Lists.freeName y listas M3U en LibraryService', () => {
  test('un nombre ya usado (sin mirar mayúsculas) pasa a "Nombre (2)", "Nombre (3)"…', () => {
    const lists = new Lists();
    lists.set([RUN, { ...RUN, id: 'l2', name: 'Para correr (2)' }]);
    assert.equal(lists.freeName('Nueva'), 'Nueva');
    assert.equal(lists.freeName('PARA CORRER'), 'PARA CORRER (3)');
  });

  test('exporta el texto M3U e importa buscando las canciones en la biblioteca', async () => {
    let written;
    const library = new LibraryService({
      exportPlaylist: async (name, text) => ((written = [name, text]), { saved: true }),
      importPlaylist: async () => ({ name: 'Viaje', text: '#EXTM3U\n/home/ana/Musica/a.mp3\nfalta.mp3\n' }),
    });
    const track = { path: 's3://musica/a.mp3', title: 'A', artist: 'B', duration: 61.4 };

    assert.deepEqual(await library.exportPlaylist('Viaje', [track]), { saved: true });
    assert.deepEqual(written, ['Viaje', '#EXTM3U\n#EXTINF:61,B - A\na.mp3\n']);
    assert.deepEqual(await library.importPlaylist([track]), { name: 'Viaje', paths: ['s3://musica/a.mp3'], missing: ['falta.mp3'] });
  });

  test('importar: cancelado → null, error del archivo tal cual, archivo sin canciones → error', async () => {
    const answers = [null, { error: 'No se pudo leer ese archivo' }, { name: 'x', text: '#EXTM3U\n' }];
    const library = new LibraryService({ importPlaylist: async () => answers.shift() });
    assert.equal(await library.importPlaylist([]), null);
    assert.deepEqual(await library.importPlaylist([]), { error: 'No se pudo leer ese archivo' });
    assert.deepEqual(await library.importPlaylist([]), { error: 'Ese archivo no tiene canciones' });
  });
});
