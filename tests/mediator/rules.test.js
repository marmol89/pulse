import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/** Reglas del patrón (Pasos 3 y 3b de la skill iniciar-proyecto) comprobadas automáticamente. */
const RENDERER = new URL('../../src/renderer/', import.meta.url);
const MAX_HANDLER_LINES = 80;

async function sources(folder) {
  const dir = new URL(folder, RENDERER);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.js'));
  return Promise.all(files.map(async (file) => ({ file, code: await readFile(new URL(file, dir), 'utf8') })));
}

const importsOf = (code) => [...code.matchAll(/^import .* from '([^']+)';$/gm)].map(([, from]) => from);

test('los colegas nunca importan otros colegas (solo core, mediator/events, ui y lib)', async () => {
  for (const { file, code } of await sources('colleagues/')) {
    for (const from of importsOf(code)) {
      const allowed = from === '../core/Colleague.js' || from === '../mediator/events.js' || /^\.\.\/(ui|lib)\//.test(from);
      assert.ok(allowed, `${file} importa ${from}`);
    }
  }
});

test('PlayerMediator solo compone: sin if, switch ni ternarios', async () => {
  const code = await readFile(new URL('mediator/PlayerMediator.js', RENDERER), 'utf8');
  const body = code.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(body, /\bif\s*\(|\bswitch\s*\(|\?[^.?]/);
});

test(`cada módulo de handlers tiene como mucho ${MAX_HANDLER_LINES} líneas`, async () => {
  for (const { file, code } of await sources('mediator/handlers/')) {
    const lines = code.trimEnd().split('\n').length;
    assert.ok(lines <= MAX_HANDLER_LINES, `handlers/${file} tiene ${lines} líneas: divídelo por caso de uso`);
  }
});

test('los handlers no importan colegas ni guardan estado de módulo', async () => {
  for (const { file, code } of await sources('mediator/handlers/')) {
    for (const from of importsOf(code)) assert.ok(['../events.js', '../actions.js'].includes(from), `handlers/${file} importa ${from}`);
    assert.doesNotMatch(code, /^(let|var) /m, `handlers/${file} declara estado mutable`);
  }
});
