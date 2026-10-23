import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { EVENTS } from '../../src/renderer/mediator/events.js';

const HANDLERS_DIR = new URL('../../src/renderer/mediator/handlers/', import.meta.url);

test('los nombres de evento son únicos y en kebab-case', () => {
  const names = Object.values(EVENTS);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, /^[a-z]+(-[a-z]+)*$/);
});

test('cada módulo de handlers solo escucha eventos del catálogo EVENTS', async () => {
  const known = new Set(Object.values(EVENTS));
  const files = (await readdir(HANDLERS_DIR)).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const { default: handlers } = await import(new URL(file, HANDLERS_DIR));
    for (const event of Object.keys(handlers)) {
      assert.ok(known.has(event), `${file} escucha un evento desconocido: "${event}"`);
      assert.equal(typeof handlers[event], 'function', `${file} → ${event} no es una función`);
    }
  }
});
