/**
 * Clase base de los colegas. Solo conocen al mediator, nunca a otros colegas.
 */
export class Colleague {
  /** @type {import('./Mediator.js').Mediator | null} */
  #mediator = null;

  setMediator(mediator) {
    this.#mediator = mediator;
  }

  notify(event, payload) {
    if (!this.#mediator) throw new Error(`${this.constructor.name} no tiene mediator`);
    this.#mediator.notify(this, event, payload);
  }
}
