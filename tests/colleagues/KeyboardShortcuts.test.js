import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardShortcuts } from '../../src/renderer/colleagues/KeyboardShortcuts.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { recordingMediator } from '../helpers/FakeAudio.js';

/** Un EventTarget que hace de elemento enfocado (event.target es él mismo). */
function element(fields = {}) {
  return Object.assign(new EventTarget(), { tagName: 'BODY', ...fields });
}

function press(target, key, modifiers = {}) {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key, ...modifiers });
  target.dispatchEvent(event);
  return event;
}

function setup(target = element()) {
  const shortcuts = new KeyboardShortcuts(target);
  const mediator = recordingMediator();
  shortcuts.setMediator(mediator);
  return { target, events: mediator.events };
}

describe('KeyboardShortcuts', () => {
  test('espacio alterna reproducción y evita el comportamiento por defecto', () => {
    const { target, events } = setup();
    const event = press(target, ' ');
    assert.deepEqual(events, [[EVENTS.PLAY_TOGGLE, undefined]]);
    assert.equal(event.defaultPrevented, true);
  });

  test('flechas: saltar ±5 s; con Ctrl, pista siguiente/anterior y volumen', () => {
    const { target, events } = setup();
    press(target, 'ArrowRight');
    press(target, 'ArrowLeft');
    press(target, 'ArrowRight', { ctrlKey: true });
    press(target, 'ArrowLeft', { metaKey: true });
    press(target, 'ArrowUp', { ctrlKey: true });
    assert.deepEqual(events, [
      [EVENTS.SEEK_STEP, 5],
      [EVENTS.SEEK_STEP, -5],
      [EVENTS.NEXT, undefined],
      [EVENTS.PREVIOUS, undefined],
      [EVENTS.VOLUME_STEP, 0.05],
    ]);
  });

  test('las letras no distinguen mayúsculas (M, S, R, L)', () => {
    const { target, events } = setup();
    for (const key of ['M', 's', 'R', 'l']) press(target, key);
    assert.deepEqual(events.map(([name]) => name), [EVENTS.TOGGLE_MUTE, EVENTS.TOGGLE_SHUFFLE, EVENTS.CYCLE_REPEAT, EVENTS.TOGGLE_FAVORITE]);
  });

  test('al escribir en un campo solo funcionan Esc y Ctrl+F', () => {
    const { target, events } = setup(element({ tagName: 'INPUT', type: 'search' }));
    const space = press(target, ' ');
    press(target, 'm');
    press(target, 'Escape');
    press(target, 'f', { ctrlKey: true });
    assert.equal(space.defaultPrevented, false);
    assert.deepEqual(events, [[EVENTS.CLOSE_NOW_PLAYING, undefined], [EVENTS.NAVIGATE, 'search']]);
  });

  test('en un deslizador las flechas son del deslizador, pero espacio sigue funcionando', () => {
    const { target, events } = setup(element({ tagName: 'INPUT', type: 'range' }));
    const arrow = press(target, 'ArrowRight');
    press(target, ' ');
    assert.equal(arrow.defaultPrevented, false);
    assert.deepEqual(events, [[EVENTS.PLAY_TOGGLE, undefined]]);
  });

  test('en un interruptor Espacio lo marca en vez de pausar', () => {
    const { target, events } = setup(element({ tagName: 'INPUT', type: 'checkbox' }));
    const space = press(target, ' ');
    press(target, 'm');
    assert.equal(space.defaultPrevented, false);
    assert.deepEqual(events, [[EVENTS.TOGGLE_MUTE, undefined]]);
  });

  test('mantener pulsado repite solo los atajos repetibles', () => {
    const { target, events } = setup();
    press(target, ' ', { repeat: true });
    press(target, 'ArrowRight', { repeat: true });
    assert.deepEqual(events, [[EVENTS.SEEK_STEP, 5]]);
  });

  test('ignora Alt, eventos ya atendidos y teclas sin atajo', () => {
    const { target, events } = setup();
    press(target, 'm', { altKey: true });
    press(target, 'x');
    const handled = new Event('keydown', { cancelable: true });
    handled.key = ' ';
    handled.preventDefault();
    target.dispatchEvent(handled);
    assert.deepEqual(events, []);
  });
});
