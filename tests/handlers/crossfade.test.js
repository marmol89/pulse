import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crossfade from '../../src/renderer/mediator/handlers/crossfade.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { tracks } from '../helpers/tracks.js';

describe('handlers/crossfade', () => {
  test('near-end precarga la que sonará después; al final de la cola, nada', () => {
    const ctx = fakeContext();
    ctx.playlist.setQueue(tracks('a', 'b'));
    crossfade[EVENTS.NEAR_END](ctx);
    ctx.playlist.next();
    crossfade[EVENTS.NEAR_END](ctx);
    assert.deepEqual(callsOf(ctx.audio.prepareNext), [['media://track/b'], [undefined]]);
  });

  test('elegir el fundido lo aplica, lo refleja en la sidebar y avisa', () => {
    const ctx = fakeContext({ audio: spy({ setCrossfade: (seconds) => seconds, crossfade: 4 }) });
    crossfade[EVENTS.APP_READY](ctx);
    crossfade[EVENTS.SET_CROSSFADE](ctx, 6);
    crossfade[EVENTS.SET_CROSSFADE](ctx, 0);
    assert.deepEqual(callsOf(ctx.router.setCrossfade), [[4], [6], [0]]);
    assert.deepEqual(callsOf(ctx.toast.show), [['Fundido de 6 s entre canciones'], ['Sin fundido entre canciones']]);
  });
});
