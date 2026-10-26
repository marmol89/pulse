import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdates } from '../../src/main/updates.js';

/** autoUpdater falso: cuenta las comprobaciones y las instalaciones. */
function fakeUpdater({ fail = false } = {}) {
  return Object.assign(new EventEmitter(), {
    checks: 0,
    installs: [],
    async checkForUpdates() {
      this.checks += 1;
      if (fail) throw new Error('sin red');
    },
    quitAndInstall(...args) {
      this.installs.push(args);
    },
  });
}

function setup({ packaged = true, platform = 'win32', env = {}, updater = fakeUpdater() } = {}) {
  const sent = [];
  const intervals = [];
  const updates = createUpdates({
    autoUpdater: updater,
    app: { isPackaged: packaged },
    platform,
    env,
    send: (status) => sent.push(status),
    timers: { setInterval: (fn, ms) => intervals.push([fn, ms]) },
  });
  return { updates, updater, sent, intervals };
}

describe('main/updates', () => {
  test('en desarrollo (sin empaquetar) no comprueba nada', () => {
    const { updates, updater, intervals } = setup({ packaged: false });
    updates.start();
    assert.equal(updates.available, false);
    assert.equal(updater.checks, 0);
    assert.deepEqual(intervals, []);
    assert.deepEqual(updates.status(), { state: 'unavailable', version: null });
  });

  test('en Linux solo el AppImage se actualiza (el .deb, el gestor de paquetes)', () => {
    assert.equal(setup({ platform: 'linux' }).updates.available, false);
    assert.equal(setup({ platform: 'linux', env: { APPIMAGE: '/home/ana/Pulse.AppImage' } }).updates.available, true);
  });

  test('comprueba al arrancar y cada 6 h, descargando sola e instalando al cerrar', async () => {
    const { updates, updater, intervals } = setup();
    updates.start();
    await Promise.resolve();
    assert.equal(updater.checks, 1);
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, true);
    assert.equal(intervals[0][1], 6 * 60 * 60 * 1000);
    intervals[0][0]();
    await Promise.resolve();
    assert.equal(updater.checks, 2);
  });

  test('descargada, avisa a la ventana con la versión y "Reiniciar ahora" la instala', () => {
    const { updates, updater, sent } = setup();
    updates.start();
    updates.install(); // aún no hay nada que instalar
    updater.emit('update-downloaded', { version: '0.6.0' });
    assert.deepEqual(sent, [{ state: 'ready', version: '0.6.0' }]);
    assert.deepEqual(updates.status(), { state: 'ready', version: '0.6.0' });
    updates.install();
    assert.deepEqual(updater.installs, [[false, true]]);
  });

  test('un fallo al comprobar (sin red) no rompe nada ni se enseña', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { updates, updater, sent } = setup({ updater: fakeUpdater({ fail: true }) });
      updates.start();
      updater.emit('error', new Error('404'));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(sent, []);
      assert.equal(updates.status().state, 'idle');
    } finally {
      console.warn = warn;
    }
  });
});
