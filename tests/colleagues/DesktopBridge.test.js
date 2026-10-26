import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DesktopBridge } from '../../src/renderer/colleagues/DesktopBridge.js';
import { EVENTS } from '../../src/renderer/mediator/events.js';
import { recordingMediator } from '../helpers/FakeAudio.js';
import { track } from '../helpers/tracks.js';

function fakeDesktop() {
  const desktop = { updates: [], closeToTray: [], listener: null };
  desktop.update = (state) => desktop.updates.push(state);
  desktop.setCloseToTray = (enabled) => desktop.closeToTray.push(enabled);
  desktop.onCommand = (listener) => {
    desktop.listener = listener;
  };
  return desktop;
}

describe('DesktopBridge', () => {
  test('cuenta lo que suena (sin repetir lo mismo) y reenvía las órdenes de la bandeja', () => {
    const desktop = fakeDesktop();
    const bridge = new DesktopBridge(desktop);
    const mediator = recordingMediator();
    bridge.setMediator(mediator);
    const song = track('a', { title: 'Ola Azul', artist: 'Marea Sur' });

    bridge.show({ track: song, playing: true });
    bridge.show({ track: song, playing: true });
    bridge.show({ track: null, playing: true });
    assert.deepEqual(desktop.updates, [
      { title: 'Ola Azul', artist: 'Marea Sur', playing: true, hasTrack: true },
      { title: '', artist: '', playing: false, hasTrack: false },
    ]);

    for (const command of ['toggle', 'next', 'previous', 'otra']) desktop.listener(command);
    assert.deepEqual(mediator.events.map(([name]) => name), [EVENTS.PLAY_TOGGLE, EVENTS.NEXT, EVENTS.PREVIOUS]);
    bridge.setCloseToTray(1);
    assert.deepEqual(desktop.closeToTray, [true]);
  });

  test('sin escritorio (Android) no está disponible ni falla', () => {
    const bridge = new DesktopBridge(undefined);
    assert.equal(bridge.available(), false);
    bridge.show({ track: track('a'), playing: true });
    bridge.setCloseToTray(true);
  });
});
