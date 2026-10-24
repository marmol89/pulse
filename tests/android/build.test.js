import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ANDROID_CSP, androidHtml } from '../../scripts/build-android.mjs';

test('androidHtml(): CSP de Android, icono, viewport-fit y api.js antes que app.js', async () => {
  const html = androidHtml(await readFile(new URL('../../src/renderer/index.html', import.meta.url), 'utf8'));
  assert.ok(html.includes(`content="${ANDROID_CSP}"`));
  assert.match(ANDROID_CSP, /media-src https: http:/, 'el audio llega de URLs firmadas de S3');
  assert.doesNotMatch(ANDROID_CSP, /'unsafe-|\*/);
  assert.ok(html.indexOf('src="api.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.includes('<html lang="es" data-platform="android">'));
  assert.throws(() => androidHtml('<html></html>'), /no tiene la forma esperada/);
});
