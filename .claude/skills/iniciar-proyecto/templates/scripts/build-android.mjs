/**
 * Prepara www/ para Capacitor (Android): el mismo renderer que Electron + www/api.js, el window.api
 * de Android (src/android/main.js empaquetado con esbuild), que se carga antes que app.js.
 * Uso: node scripts/build-android.mjs  (después, `npx cap sync android`).
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const www = new URL('www/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

/** En Android el audio viene de URLs firmadas de S3 (http o https) y las carátulas son archivos de la app ('self'). */
export const ANDROID_CSP =
  "default-src 'self'; img-src 'self' data: blob:; media-src https: http: blob:; connect-src 'self' blob:; style-src 'self'; font-src 'self'; script-src 'self'";

/** index.html de Electron → el de Android: otra CSP, data-platform y api.js antes de app.js. */
export function androidHtml(html) {
  const result = html
    .replace(/(http-equiv="Content-Security-Policy"\s+content=")[^"]*"/, `$1${ANDROID_CSP}"`)
    .replace('<html lang="es">', '<html lang="es" data-platform="android">')
    .replace('<title>Pulse</title>', '<title>Pulse</title>\n    <link rel="icon" href="icon.png" />')
    .replace(/name="viewport" content="[^"]*"/, 'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"')
    .replace('<script type="module" src="app.js"></script>', '<script src="api.js"></script>\n    <script type="module" src="app.js"></script>');
  for (const expected of [ANDROID_CSP, 'data-platform="android"', 'viewport-fit=cover', 'src="api.js"', 'rel="icon"']) {
    if (!result.includes(expected)) throw new Error(`index.html no tiene la forma esperada (falta ${expected})`);
  }
  return result;
}

/** Las fuentes Inter que importa tokens.css, con los archivos woff2 que usan. */
async function copyFonts() {
  const source = new URL('node_modules/@fontsource/inter/', root);
  const target = new URL('node_modules/@fontsource/inter/', www);
  const tokens = await readFile(new URL('src/renderer/styles/tokens.css', root), 'utf8');
  await mkdir(new URL('files/', target), { recursive: true });
  for (const [, sheet] of tokens.matchAll(/@import '[./]*node_modules\/@fontsource\/inter\/([\w-]+\.css)';/g)) {
    const css = await readFile(new URL(sheet, source), 'utf8');
    await writeFile(new URL(sheet, target), css);
    for (const [, file] of css.matchAll(/url\(\.\/files\/([\w-]+\.woff2)\)/g)) await cp(new URL(`files/${file}`, source), new URL(`files/${file}`, target));
  }
}

// Al importarlo (tests) solo se usan androidHtml y ANDROID_CSP.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await rm(www, { recursive: true, force: true });
  await cp(new URL('src/renderer/', root), www, { recursive: true });
  await cp(new URL('src/assets/icon.png', root), new URL('icon.png', www));
  await copyFonts();
  const index = new URL('index.html', www);
  await writeFile(index, androidHtml(await readFile(index, 'utf8')));
  await build({
    entryPoints: [fileURLToPath(new URL('src/android/main.js', root))],
    outfile: fileURLToPath(new URL('api.js', www)),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome110',
    minify: true,
    legalComments: 'none',
    define: { __PULSE_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
  console.log(`www/ listo para Android (Pulse ${version})`);
}
