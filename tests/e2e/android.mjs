/**
 * Prueba de humo del APK en un emulador (o móvil por USB) con playwright-core (_android):
 * instala dist/Pulse-X.Y.Z-debug.apk desde cero, conecta la app con un S3 falso que corre en este
 * equipo (el emulador lo ve en 10.0.2.2), recorre las pantallas, reproduce desde una URL firmada,
 * salta, sube una canción y guarda capturas en tests/e2e/output/android-*.png. Nunca usa tu S3 real.
 * Uso: npm run android:apk && npm run test:e2e:android   (con el emulador arrancado; volumen multimedia a 0)
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _android as android } from 'playwright-core';
import { createWav } from '../helpers/audio.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { FIXTURES, bucketObjects } from './fixtures.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('output/', import.meta.url));
const PACKAGE = 'com.marmol89.pulse';
/** Desde el emulador, el equipo es 10.0.2.2 (con un móvil por USB: PULSE_HOST=<ip del equipo>). */
const HOST = process.env.PULSE_HOST ?? '10.0.2.2';

const problems = [];
const check = (condition, message) => {
  console.log(`${condition ? '✔' : '✖'} ${message}`);
  if (!condition) problems.push(message);
};

const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const apk = path.join(ROOT, 'dist', `Pulse-${version}-debug.apk`);
const s3 = await startFakeS3({ buckets: { musica: bucketObjects() }, host: '0.0.0.0' });
const endpoint = `http://${HOST}:${new URL(s3.endpoint).port}`;
await mkdir(OUTPUT, { recursive: true });

const [device] = await android.devices();
if (!device) {
  console.error('No hay ningún emulador ni móvil conectado (adb devices).');
  process.exit(1);
}
// Silencio con el volumen multimedia del sistema, no con el de Pulse: Chromium no abre salida de audio para un
// <audio> silenciado, y sin ella Android no ve a Pulse sonando ni le pasa las teclas de los auriculares.
const MUSIC_STREAM = '--stream 3';
const volumeBefore = (await device.shell(`cmd media_session volume ${MUSIC_STREAM} --get`)).toString().match(/volume is (\d+)/)?.[1];
await device.shell(`cmd media_session volume ${MUSIC_STREAM} --set 0`);
try {
  // Desde cero: sin conexión guardada ni biblioteca de una prueba anterior.
  await device.installApk(await readFile(apk));
  await device.shell(`pm clear ${PACKAGE}`);
  await device.shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
  let webview = await device.webView({ pkg: PACKAGE });
  let page = await webview.page();
  const shot = (name) => device.screenshot({ path: path.join(OUTPUT, `android-${name}.png`) });
  const logs = [];
  const watch = (target) => {
    target.on('console', (message) => message.type() === 'error' && logs.push(`[error] ${message.text()}`));
    target.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
  };
  watch(page);

  // Antes de conectar: sin datos de internet.
  await page.waitForSelector('.connection[open]', { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('pulse.onlineLookup', 'false'));
  await page.reload();
  await page.waitForSelector('.connection[open]');
  check(true, 'la primera vez se abre el formulario de conexión');
  await shot('01-conexion');

  const fillConnection = async (accessKeyId) => {
    await page.fill('#connection-endpoint', endpoint);
    await page.fill('#connection-accessKeyId', accessKeyId);
    await page.fill('#connection-secretAccessKey', s3.config.secretAccessKey);
    await page.click('.connection button[type="submit"]');
  };
  await fillConnection('clave-incorrecta');
  await page.waitForSelector('.connection__error:not([hidden])', { timeout: 20000 });
  check((await page.textContent('.connection__error')).includes('claves no son válidas'), 'con claves incorrectas explica el error (red nativa: sin CORS)');
  await fillConnection(s3.config.accessKeyId);
  await page.waitForSelector('.connection', { state: 'hidden', timeout: 20000 });
  check(true, `conecta con ${endpoint} (http en claro desde el móvil)`);

  await page.waitForSelector('.feature-card', { timeout: 30000 });
  check((await page.locator('.genre-card').count()) === 2, 'Inicio muestra los 2 géneros');
  check(await page.isVisible('.sidebar .nav__item--menu'), 'la sidebar es la tab bar de abajo, con "Tu música"');
  await shot('02-inicio');

  await page.click('.feature-card .play-button');
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__range')?.value > 0, null, { timeout: 20000 });
  check(true, 'Mix diario: la pista suena desde la URL firmada y el tiempo avanza');
  const title = await page.textContent('.player__title');
  await page.click('.player button[aria-label="Siguiente"]');
  await page.waitForFunction((previous) => document.querySelector('.player__title')?.textContent !== previous, title);
  check(true, 'Siguiente cambia de pista');
  check(s3.requests.some((request) => request.signedUrl && request.range), 'el <audio> pide rangos al bucket con la URL firmada');

  // En segundo plano sigue sonando (servicio en primer plano): las pistas duran 10 s, así que pasa a la siguiente.
  const before = await page.textContent('.player__title');
  await device.shell('input keyevent KEYCODE_HOME');
  await page.waitForFunction((previous) => document.querySelector('.player__title')?.textContent !== previous, before, { timeout: 20000 }).catch(() => {});
  const after = await page.textContent('.player__title');
  check(after !== before, `en segundo plano sigue sonando y pasa de pista ("${before}" → "${after}")`);
  const session = (await device.shell('dumpsys media_session')).toString();
  check(session.includes('package=com.marmol89.pulse') && session.includes(`description=${after}`), 'la pista que suena está en los controles del sistema (MediaSession)');
  await device.shell('input keyevent KEYCODE_MEDIA_PAUSE');
  await page.waitForSelector('.player button[aria-label="Reproducir"]', { timeout: 5000 }).catch(() => {});
  check(await page.isVisible('.player button[aria-label="Reproducir"]'), 'la tecla de pausa de los auriculares pausa');
  await device.shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
  await page.click('.player button[aria-label="Reproducir"]');

  await page.click('.player__cover');
  await page.waitForSelector('.now-playing.is-open');
  await page.waitForTimeout(400);
  await shot('03-reproduciendo');
  await device.shell('input keyevent KEYCODE_BACK'); // el botón atrás de Android cierra Reproduciendo
  await page.waitForSelector('.now-playing:not(.is-open)');
  check(true, 'el botón atrás cierra Reproduciendo');

  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForSelector('.view--collection .track-row');
  check((await page.locator('.view--collection .track-row').count()) === FIXTURES.length, 'Biblioteca lista todas las pistas');
  // Las carátulas incrustadas llegan en segundo plano como archivos locales de la app.
  await page.waitForSelector('.view--collection .track-row img[src*="_capacitor_file_"]', { timeout: 30000 });
  check(true, 'las carátulas incrustadas se guardan en el móvil y se muestran');
  await shot('04-biblioteca');

  await page.click('.nav__item:has-text("Buscar")');
  await page.fill('.view--search input', 'selva');
  await page.waitForSelector('.view--search .track-row');
  check((await page.locator('.view--search .track-row').count()) === 1, 'Buscar "selva" encuentra 1 pista');

  // Listas: en el móvil se llega desde Inicio ("Tus listas") y "+" se ve siempre en las filas.
  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.media-card:has-text("Nueva lista")');
  await page.waitForSelector('.list-dialog[open]');
  await page.fill('#list-dialog-name', 'Para correr');
  await page.click('.list-dialog button[type="submit"]');
  await page.waitForSelector('.view--collection:not([hidden]) .collection-header__title:has-text("Para correr")');
  check(true, 'Inicio › "Nueva lista" crea la lista y la abre');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.locator('.view--collection .track-row:has-text("Selva") [data-action="add"]').click();
  await page.waitForSelector('.list-dialog[open] .list-picker__item');
  await page.waitForTimeout(300);
  await shot('05-anadir-a-lista');
  await page.click('.list-picker__item:has-text("Para correr")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Añadida a «Para correr»');
  check(true, '"+" en una fila añade la canción a la lista');
  const listsInBucket = async () => {
    for (let i = 0; i < 40; i += 1) {
      const body = s3.get('musica', 'metadatos/listas.json');
      const lists = body ? JSON.parse(body.toString()).lists : [];
      if (lists[0]?.tracks.length === 1) return lists;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return [];
  };
  check((await listsInBucket()).length === 1, 'la lista se sube a metadatos/listas.json del bucket');
  await page.locator('.view--collection .track-row:has-text("Selva") .favorite-button').click();
  const favoritesInBucket = async () => {
    for (let i = 0; i < 40; i += 1) {
      const body = s3.get('musica', 'metadatos/favoritos.json');
      const favorites = body ? JSON.parse(body.toString()).favorites : [];
      if (favorites.some((record) => !record.deleted && record.id.endsWith('/Selva.wav'))) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };
  check(await favoritesInBucket(), 'el corazón se sube a metadatos/favoritos.json del bucket');
  await page.click('.nav__item:has-text("Inicio")');
  await page.waitForSelector('.section[aria-label="Tus listas"] .media-card:has-text("Para correr")');
  await shot('06-inicio-listas');

  await page.click('.nav__item--menu');
  await page.waitForSelector('.sidebar.is-menu-open');
  await page.waitForTimeout(400);
  await shot('07-tu-musica');
  check((await page.textContent('.nav__status')).startsWith('musica'), '"Tu música" muestra el bucket conectado');

  // Subir: el selector de archivos del sistema no se puede manejar desde aquí; se suelta un File,
  // que llega a la misma subida (en Android el File se sube tal cual).
  const wav = createWav({ seconds: 3, tags: { title: 'Brisa', artist: 'Marea Sur', album: 'Mareas', genre: 'Lo-fi chill' } });
  await page.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'Brisa.wav', { type: 'audio/wav' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, [...wav]);
  // Tras subir se sincroniza: el aviso final es el de la canción nueva en la biblioteca.
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('1 canción nueva'), null, { timeout: 30000 });
  check(Boolean(s3.get('musica', 'Brisa.wav')), 'subir una canción la deja en el bucket y llega a la biblioteca');

  // Al volver a abrir la app recuerda la conexión (clave secreta en el Keystore) y la biblioteca.
  await device.shell(`am force-stop ${PACKAGE}`);
  await device.shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
  webview = await device.webView({ pkg: PACKAGE });
  page = await webview.page();
  watch(page);
  await page.waitForSelector('.feature-card', { timeout: 30000 });
  check(!(await page.isVisible('.connection[open]')), 'al reabrir no pide la conexión otra vez');

  check(logs.length === 0, 'sin errores de consola');
  for (const log of logs) console.log(`   ${log}`);
} finally {
  if (volumeBefore) await device.shell(`cmd media_session volume ${MUSIC_STREAM} --set ${volumeBefore}`);
  await s3.close();
  device.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} comprobaciones fallidas.`);
  process.exit(1);
}
console.log(`\nTodo correcto. Capturas en ${OUTPUT}`);
