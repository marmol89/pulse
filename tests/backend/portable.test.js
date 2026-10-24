import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/** El backend corre en Electron y en el WebView de Android: nada de Node ni de Electron. */
test('src/backend no importa módulos de Node ni de Electron', async () => {
  const root = new URL('../../src/backend/', import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.js'));
  assert.ok(files.length > 10);
  for (const file of files) {
    const code = await readFile(new URL(file.replace(/\\/g, '/'), root), 'utf8');
    for (const [, from] of code.matchAll(/^import .* from '([^']+)';$/gm)) {
      assert.ok(!from.startsWith('node:') && from !== 'electron' && !from.includes('/main/'), `${file} importa ${from}`);
    }
    assert.doesNotMatch(code, /\bBuffer\.|\bprocess\.|require\(/, `${file} usa APIs de Node`);
  }
});
