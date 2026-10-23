import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Mediator } from '../src/renderer/core/Mediator.js';
import { Colleague } from '../src/renderer/core/Colleague.js';

class TestMediator extends Mediator {
  constructor(context = {}) {
    super();
    this.ctx = context;
  }

  get context() {
    return this.ctx;
  }
}

describe('Mediator', () => {
  test('use() registra los handlers de un módulo y notify() les pasa ctx, payload y sender', async () => {
    const ctx = { name: 'ctx' };
    const mediator = new TestMediator(ctx);
    const calls = [];
    mediator.use({ ping: (...args) => calls.push(args) });

    await mediator.notify('emisor', 'ping', 42);

    assert.deepEqual(calls, [[ctx, 42, 'emisor']]);
  });

  test('notify() ejecuta en orden varios handlers del mismo evento', async () => {
    const mediator = new TestMediator();
    const order = [];
    mediator.use({ ping: async () => order.push('a') });
    mediator.use({ ping: () => order.push('b') });

    await mediator.notify(null, 'ping');

    assert.deepEqual(order, ['a', 'b']);
  });

  test('un evento sin handler solo avisa por consola', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const mediator = new TestMediator();

    await mediator.notify(null, 'desconocido');

    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /desconocido/);
  });

  test('un handler que falla no impide que se ejecuten los demás', async (t) => {
    const error = t.mock.method(console, 'error', () => {});
    const mediator = new TestMediator();
    const after = mock.fn();
    mediator.on('ping', () => {
      throw new Error('boom');
    });
    mediator.on('ping', after);

    await mediator.notify(null, 'ping');

    assert.equal(after.mock.callCount(), 1);
    assert.equal(error.mock.callCount(), 1);
  });

  test('on() rechaza eventos no válidos (p. ej. una clave de EVENTS mal escrita)', () => {
    const mediator = new TestMediator();
    assert.throws(() => mediator.on(undefined, () => {}), TypeError);
    assert.throws(() => mediator.use({ [undefined]: () => {} }), TypeError);
    assert.throws(() => mediator.on('ping', 'no-es-función'), TypeError);
  });

  test('la clase base exige definir context', async (t) => {
    const error = t.mock.method(console, 'error', () => {});
    const mediator = new Mediator();
    mediator.on('ping', () => {});

    await mediator.notify(null, 'ping');

    assert.equal(error.mock.callCount(), 1);
    assert.match(String(error.mock.calls[0].arguments[1]), /debe definir el getter context/);
  });
});

describe('Colleague', () => {
  test('notify() reenvía al mediator con el propio colega como emisor', async () => {
    const received = [];
    const mediator = { notify: async (...args) => received.push(args) };
    const colleague = new Colleague();
    colleague.setMediator(mediator);

    await colleague.notify('ping', 1);

    assert.deepEqual(received, [[colleague, 'ping', 1]]);
  });

  test('notify() sin mediator lanza un error descriptivo', () => {
    assert.throws(() => new Colleague().notify('ping'), /no tiene mediator/);
  });
});
