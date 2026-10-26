import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDesktop } from '../../src/main/desktop.js';

/** Piezas de Electron falsas: bandeja, menú, imágenes, app y ventana. */
function fakes(platform = 'win32') {
  const sent = [];
  const trays = [];
  class Tray extends EventEmitter {
    constructor(icon) {
      super();
      this.icon = icon;
      trays.push(this);
    }
    setToolTip(text) {
      this.tooltip = text;
    }
    setContextMenu(menu) {
      this.menu = menu;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const Menu = { buildFromTemplate: (items) => items };
  const nativeImage = { createFromPath: (file) => ({ file, resize: () => ({ file, resized: true }) }) };
  const app = Object.assign(new EventEmitter(), { quitCalls: 0, quit() { this.quitCalls += 1; } });
  const win = Object.assign(new EventEmitter(), {
    hidden: false,
    thumbar: null,
    isMinimized: () => false,
    restore() {},
    show() { this.hidden = false; },
    hide() { this.hidden = true; },
    focus() {},
    setThumbarButtons(buttons) { this.thumbar = buttons; },
  });
  const desktop = createDesktop({ Tray, Menu, nativeImage, app, platform, assets: '/assets', getWindow: () => win, send: (command) => sent.push(command) });
  return { desktop, sent, trays, app, win };
}

const close = (win) => {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  win.emit('close', event);
  return event.prevented;
};

describe('main/desktop', () => {
  test('la bandeja muestra lo que suena y sus opciones mandan órdenes a la ventana', () => {
    const { desktop, sent, trays, win } = fakes();
    desktop.attach(win);
    assert.equal(trays.length, 1);
    assert.equal(trays[0].menu[0].label, 'Nada sonando');
    assert.equal(trays[0].menu.find((item) => item.label === 'Siguiente').enabled, false);

    desktop.update({ title: 'Ola Azul', artist: 'Marea Sur', playing: true, hasTrack: true });
    const menu = trays[0].menu;
    assert.equal(menu[0].label, 'Ola Azul · Marea Sur');
    assert.equal(trays[0].tooltip, 'Pulse · Ola Azul · Marea Sur');
    for (const label of ['Pausar', 'Anterior', 'Siguiente']) menu.find((item) => item.label === label).click();
    assert.deepEqual(sent, ['toggle', 'previous', 'next']);

    win.hide();
    trays[0].emit('click');
    assert.equal(win.hidden, false, 'pulsar el icono muestra la ventana');
  });

  test('en Windows, la miniatura tiene Anterior, Reproducir/Pausa y Siguiente', () => {
    const { desktop, sent, win } = fakes('win32');
    desktop.attach(win);
    assert.deepEqual(win.thumbar.map((button) => [button.tooltip, button.flags ?? []]), [['Anterior', ['disabled']], ['Reproducir', []], ['Siguiente', ['disabled']]]);
    desktop.update({ title: 'a', artist: 'b', playing: true, hasTrack: true });
    assert.equal(win.thumbar[1].tooltip, 'Pausar');
    assert.equal(win.thumbar[1].icon.file.replaceAll('\\', '/'), '/assets/controles/pause.png');
    win.thumbar[2].click();
    assert.deepEqual(sent, ['next']);
    const linux = fakes('linux');
    linux.desktop.attach(linux.win);
    assert.equal(linux.win.thumbar, null, 'fuera de Windows no hay miniatura con botones');
  });

  test('"Al cerrar, seguir en la bandeja": cerrar oculta; "Salir" o salir de la app cierra de verdad', () => {
    const { desktop, trays, app, win } = fakes();
    desktop.attach(win);
    assert.equal(close(win), false, 'desactivado: se cierra como siempre');
    desktop.setCloseToTray(true);
    assert.equal(close(win), true);
    assert.equal(win.hidden, true);
    trays[0].menu.find((item) => item.label === 'Salir').click();
    assert.equal(app.quitCalls, 1);
    assert.equal(close(win), false);

    const other = fakes();
    other.desktop.attach(other.win);
    other.desktop.setCloseToTray(true);
    other.app.emit('before-quit');
    assert.equal(close(other.win), false, 'al salir (p. ej. al apagar) no se queda oculta');
  });
});
