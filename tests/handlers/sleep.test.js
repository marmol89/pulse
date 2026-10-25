import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import sleep from '../../src/renderer/mediator/handlers/sleep.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { SleepTimer } from '../../src/renderer/colleagues/SleepTimer.js';
import { fakeContext, spy, callsOf } from '../helpers/fakeContext.js';
import { recordingMediator } from '../helpers/FakeAudio.js';

/** Reloj falso: los temporizadores solo corren con tick(). */
function fakeTimers() {
  let now = 0;
  const pending = new Map();
  let ids = 0;
  return {
    now: () => now,
    timers: {
      setTimeout: (task, delay) => (pending.set(++ids, { task, at: now + delay }), ids),
      clearTimeout: (id) => pending.delete(id),
    },
    tick(ms) {
      now += ms;
      for (const [id, { task, at }] of [...pending]) {
        if (at > now) continue;
        pending.delete(id);
        task();
      }
    },
    pending: () => pending.size,
  };
}

describe('SleepTimer', () => {
  test('avisa al acabar el tiempo y se puede cancelar', () => {
    const clock = fakeTimers();
    const timer = new SleepTimer(clock);
    const mediator = recordingMediator();
    timer.setMediator(mediator);

    timer.start(15);
    assert.deepEqual(timer.state(), { mode: 'minutes', endsAt: 15 * 60_000 });
    clock.tick(14 * 60_000);
    assert.deepEqual(mediator.events, []);
    clock.tick(60_000);
    assert.deepEqual(mediator.events, [[EVENTS.SLEEP_TIMER_ENDED, undefined]]);
    assert.equal(timer.state().mode, 'off');

    timer.start(30);
    timer.cancel();
    assert.equal(clock.pending(), 0);
    timer.startEndOfTrack();
    assert.deepEqual(timer.state(), { mode: 'track', endsAt: 0 });
  });
});

describe('handlers/sleep', () => {
  test('elegir una duración lo activa, lo enseña en Reproduciendo y avisa', () => {
    const ctx = fakeContext();
    sleep[EVENTS.SET_SLEEP_TIMER](ctx, 30);
    assert.equal(ctx.sleepTimer.state().mode, 'minutes');
    assert.equal(callsOf(ctx.nowPlaying.setSleepTimer)[0][0].mode, 'minutes');
    sleep[EVENTS.SET_SLEEP_TIMER](ctx, 60);
    sleep[EVENTS.SET_SLEEP_TIMER](ctx, 'track');
    sleep[EVENTS.SET_SLEEP_TIMER](ctx, null);
    assert.equal(ctx.sleepTimer.state().mode, 'off');
    assert.deepEqual(callsOf(ctx.toast.show).map(([message]) => message), [
      'La música se parará en 30 min',
      'La música se parará en 1 h',
      'La música se parará al acabar esta canción',
      'Temporizador desactivado',
    ]);
  });

  test('al acabar el tiempo baja el volumen y pausa', async () => {
    const ctx = fakeContext({ audio: spy({ fadeOut: async () => {} }) });
    await sleep[EVENTS.SLEEP_TIMER_ENDED](ctx);
    assert.equal(ctx.audio.fadeOut.mock.callCount(), 1);
    assert.equal(callsOf(ctx.nowPlaying.setSleepTimer)[0][0].mode, 'off');
  });

  test('"Al acabar esta canción" pausa al terminar la pista una sola vez', () => {
    const ctx = fakeContext();
    sleep[EVENTS.ENDED](ctx);
    assert.equal(ctx.audio.pause.mock.callCount(), 0, 'sin temporizador no hace nada');
    ctx.sleepTimer.startEndOfTrack();
    sleep[EVENTS.ENDED](ctx);
    sleep[EVENTS.ENDED](ctx);
    assert.equal(ctx.audio.pause.mock.callCount(), 1);
    assert.equal(ctx.sleepTimer.state().mode, 'off');
  });
});
