/**
 * Clase base del patrón Mediator.
 * Solo enruta: guarda qué handlers reaccionan a cada evento y los ejecuta.
 * Las reglas de coordinación viven en módulos de handlers, no aquí.
 */
export class Mediator {
  /** @type {Map<string, Function[]>} */
  #handlers = new Map();

  /** Contexto que reciben los handlers (colegas). Lo definen las subclases. */
  get context() {
    throw new Error(`${this.constructor.name} debe definir el getter context`);
  }

  on(event, handler) {
    if (typeof event !== 'string' || event === '' || event === 'undefined') {
      throw new TypeError(`Evento no válido: ${String(event)}`);
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`El handler de "${event}" debe ser una función`);
    }
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event).push(handler);
    return this;
  }

  /** Registra un módulo de handlers: { [evento]: (ctx, payload, sender) => ... } */
  use(handlerModule) {
    for (const [event, handler] of Object.entries(handlerModule)) this.on(event, handler);
    return this;
  }

  /**
   * Inicia en orden los handlers del evento y espera a que terminen todos.
   * Uno lento (p. ej. un IPC) no retrasa a los siguientes, y uno que falla
   * se registra en consola sin impedir que se ejecuten los demás.
   */
  async notify(sender, event, payload) {
    const handlers = this.#handlers.get(event);
    if (!handlers) {
      console.warn(`[${this.constructor.name}] evento sin handler: ${event}`, sender);
      return;
    }
    await Promise.all(handlers.map((handler) => this.#run(handler, event, payload, sender)));
  }

  async #run(handler, event, payload, sender) {
    try {
      await handler(this.context, payload, sender);
    } catch (error) {
      console.error(`[${this.constructor.name}] error al manejar "${event}"`, error);
    }
  }
}
