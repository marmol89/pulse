import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const STYLES = new URL('../../src/renderer/styles/', import.meta.url);

/**
 * Regla de la skill: layout.css y components.css solo usan tokens de tokens.css
 * para colores, radios y tamaños de fuente.
 */
for (const file of ['layout.css', 'components.css']) {
  test(`${file} usa solo tokens para colores, radios y tamaños de fuente`, async () => {
    const css = (await readFile(new URL(file, STYLES), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    const problems = [];
    css.split('\n').forEach((line, index) => {
      const where = `${file}:${index + 1}: ${line.trim()}`;
      if (/#[0-9a-f]{3,8}\b/i.test(line)) problems.push(`color hexadecimal → ${where}`);
      if (/\brgba?\(|\bhsla?\(/i.test(line)) problems.push(`color rgb/hsl → ${where}`);
      for (const property of ['font-size', 'border-radius']) {
        const value = new RegExp(`${property}:\\s*([^;]+)`).exec(line)?.[1].trim();
        if (value && !value.startsWith('var(')) problems.push(`${property} sin token → ${where}`);
      }
    });
    assert.deepEqual(problems, []);
  });
}

test('tokens.css define todos los tokens que usan los demás estilos', async () => {
  const tokens = await readFile(new URL('tokens.css', STYLES), 'utf8');
  const defined = new Set([...tokens.matchAll(/(--[\w-]+):/g)].map(([, name]) => name));
  const missing = [];
  for (const file of ['layout.css', 'components.css']) {
    const css = await readFile(new URL(file, STYLES), 'utf8');
    const localNames = new Set([...css.matchAll(/(--[\w-]+):/g)].map(([, name]) => name));
    for (const [, name] of css.matchAll(/var\((--[\w-]+)/g)) {
      if (!defined.has(name) && !localNames.has(name)) missing.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
