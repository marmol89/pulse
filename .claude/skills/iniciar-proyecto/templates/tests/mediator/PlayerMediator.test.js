import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerMediator } from '../../src/renderer/mediator/PlayerMediator.js';
import { Colleague } from '../../src/renderer/core/Colleague.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('PlayerMediator', () => {
  test('conecta a todos los colegas consigo mismo y congela el contexto', () => {
    const colleagues = fakeContext();
    const mediator = new PlayerMediator(colleagues);

    assert.deepEqual(callsOf(colleagues.router.setMediator), [[mediator]]);
    assert.deepEqual(callsOf(colleagues.controls.setMediator), [[mediator]]);
    assert.ok(Object.isFrozen(mediator.context));
    assert.equal(mediator.context.audio, colleagues.audio);
  });

  test('app-ready llega a varios módulos: biblioteca, volumen, modos y salida', async () => {
    const colleagues = fakeContext({ library: spy({ load: async () => tracks('a', 'b') }) });
    const mediator = new PlayerMediator(colleagues);

    await mediator.notify(null, EVENTS.APP_READY);

    assert.equal(colleagues.catalog.size(), 2);
    assert.equal(colleagues.controls.setVolume.mock.callCount(), 1);
    assert.equal(colleagues.controls.setModes.mock.callCount(), 1);
    assert.equal(colleagues.nowPlaying.setOutputDevice.mock.callCount(), 1);
  });

  test('un colega notifica y el mediator coordina a otros sin que se conozcan', async () => {
    const keyboard = new Colleague(); // emisor real: solo conoce al mediator
    const colleagues = fakeContext({ keyboard });
    new PlayerMediator(colleagues);
    const [, b] = tracks('a', 'b');
    colleagues.playlist.setQueue(tracks('a', 'b'));

    await keyboard.notify(EVENTS.NEXT);

    assert.deepEqual(callsOf(colleagues.audio.load), [[b.url, true]]);
    assert.equal(colleagues.controls.show.mock.callCount(), 1);
    assert.equal(colleagues.nowPlaying.show.mock.callCount(), 1);
  });
});
