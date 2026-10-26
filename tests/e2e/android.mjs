/**
 * Prueba de humo del APK en un emulador (o móvil por USB) con playwright-core (_android):
 * instala dist/Pulse-X.Y.Z-debug.apk desde cero, conecta la app con un S3 falso que corre en este
 * equipo (el emulador lo ve en 10.0.2.2), recorre las pantallas, reproduce desde una URL firmada,
 * salta, sube una canción, usa una carpeta del móvil (selector del sistema) y guarda capturas en tests/e2e/output/android-*.png. Nunca usa tu S3 real.
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

/** Carpeta del móvil para la prueba de las carpetas (se elige en el selector del sistema). */
const PHONE_FOLDER = '/sdcard/Music/Pulse e2e';

/**
 * Toca el elemento nativo con ese texto (el selector de carpetas del sistema está fuera del WebView): lo busca en
 * un volcado de uiautomator y toca su centro, sin necesitar el driver de Playwright para Android.
 */
async function tapText(device, text) {
  const pattern = new RegExp(`text="${text}"[^>]*bounds=".(\\d+),(\\d+)..(\\d+),(\\d+)."`, 'i');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await device.shell('uiautomator dump /sdcard/pulse-ui.xml');
    const match = pattern.exec((await device.shell('cat /sdcard/pulse-ui.xml')).toString());
    if (match) {
      await device.shell(`input tap ${(Number(match[1]) + Number(match[3])) >> 1} ${(Number(match[2]) + Number(match[4])) >> 1}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`No aparece «${text}» en la pantalla`);
}

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

  // Listas: en el móvil se llega desde Inicio ("Tus listas"); en las filas solo se ve el "⋯", con todas sus opciones.
  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.media-card:has-text("Nueva lista")');
  await page.waitForSelector('.list-dialog[open]');
  await page.fill('#list-dialog-name', 'Para correr');
  await page.click('.list-dialog button[type="submit"]');
  await page.waitForSelector('.view--collection:not([hidden]) .collection-header__title:has-text("Para correr")');
  check(true, 'Inicio › "Nueva lista" crea la lista y la abre');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.locator('.view--collection .track-row:has-text("Selva") [data-action="more"]').click();
  check((await page.locator('.view--collection .track-row:has-text("Selva") [data-action="add"]').isHidden()), 'en el móvil la fila solo muestra el "⋯"');
  await page.click('.menu__item:has-text("Añadir a una lista")');
  await page.waitForSelector('.list-dialog[open] .list-picker__item');
  await page.waitForTimeout(300);
  await shot('05-anadir-a-lista');
  await page.click('.list-picker__item:has-text("Para correr")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Añadida a «Para correr»');
  check(true, '"⋯" › "Añadir a una lista" añade la canción a la lista');
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
  await page.locator('.view--collection .track-row:has-text("Selva") [data-action="more"]').click();
  await page.click('.menu__item:has-text("Añadir a favoritos")');
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
  // Lo que sonó entero en segundo plano ya cuenta como escuchado (y va al bucket con el id de este móvil).
  let plays = [];
  for (let i = 0; i < 40 && plays.length === 0; i += 1) {
    const body = s3.get('musica', 'metadatos/escuchas.json');
    plays = body ? JSON.parse(body.toString()).plays : [];
    if (plays.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(plays.length > 0 && plays.every((play) => play.count > 0), `lo escuchado se cuenta en metadatos/escuchas.json (${plays.length} canciones)`);
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

  // Sin conexión: se descarga la lista en el móvil y suena aunque el bucket no responda.
  await page.click('.section[aria-label="Tus listas"] .media-card:has-text("Para correr")');
  await page.waitForSelector('.view--collection:not([hidden]) .collection-actions__download:not([hidden])');
  await page.click('.collection-actions__download');
  await page.waitForSelector('.collection-actions__download[data-state="all"]', { timeout: 30000 });
  check(true, '"Descargar" guarda la lista en el móvil');
  await shot('08-lista-descargada');
  await page.click('.nav__item--menu');
  await page.waitForSelector('.sidebar.is-menu-open');
  check((await page.textContent('.downloads-row')).includes('1 canción'), '"Tu música" cuenta lo descargado');
  await page.click('.nav__item--menu');

  // Papelera por la red nativa (CopyObject y un DELETE que responde 204 sin cuerpo).
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.click('.view--collection .track-row:has-text("Brisa") [data-action="more"]');
  await page.click('.menu__item:has-text("Eliminar del bucket")');
  await page.waitForSelector('.trash-dialog[open] button[type="submit"]:not([hidden])');
  await page.click('.trash-dialog button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Movida a la papelera del bucket', null, { timeout: 15000 });
  check(!s3.get('musica', 'Brisa.wav') && Boolean(s3.get('musica', 'papelera/Brisa.wav')), '"Eliminar del bucket" la mueve a la papelera desde el móvil');
  await page.click('.nav__item--menu');
  await page.click('.nav__item:has-text("Papelera")');
  await page.waitForSelector('.trash-dialog[open] .trash-item:has-text("Brisa.wav")');
  await shot('09-papelera');
  await page.click('.trash-item:has-text("Brisa") .trash-item__restore');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.startsWith('Restaurada'), null, { timeout: 15000 });
  await page.click('.trash-dialog .link-button:has-text("Cerrar")');
  check(Boolean(s3.get('musica', 'Brisa.wav')) && !s3.get('musica', 'papelera/Brisa.wav'), 'desde "Papelera" se restaura en el bucket');

  check(logs.length === 0, 'sin errores de consola');
  for (const log of logs) console.log(`   ${log}`);

  s3.setOffline(true);
  await page.click('.view--collection:not([hidden]) .collection-actions .play-button');
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent === '0:00', null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:02', null, { timeout: 15000 });
  check(true, 'sin conexión con el bucket, la canción descargada suena desde el móvil');
  s3.setOffline(false);

  // Carpetas del móvil en vez del bucket: el selector del sistema (SAF) se recorre tocando sus textos.
  await device.shell(`mkdir -p '${PHONE_FOLDER}'`);
  await device.push(createWav({ seconds: 10, tags: { title: 'Canción del móvil', artist: 'Río Claro' } }), `${PHONE_FOLDER}/Local.wav`);
  await page.click('.nav__item--menu');
  await page.click('.nav__item:has-text("Conexión")');
  await page.click('#connection-tab-local');
  await page.click('#connection-add-folder');
  for (const text of ['Music', 'Pulse e2e', 'USE THIS FOLDER', 'ALLOW']) await tapText(device, text);
  await page.waitForSelector('.connection__folders .list-picker__item:has-text("Pulse e2e")', { timeout: 15000 });
  await shot('10-carpetas');
  await page.click('.connection button[type="submit"]');
  await page.waitForSelector('.connection', { state: 'hidden', timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.nav__status')?.textContent === 'Pulse e2e', null, { timeout: 15000 });
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.view--collection:not([hidden]) .track-row');
    return rows.length === 1 && rows[0].textContent.includes('Canción del móvil');
  }, null, { timeout: 20000 });
  check(true, 'con una carpeta del móvil, la biblioteca es su música (con sus etiquetas)');
  await page.click('.view--collection:not([hidden]) .collection-actions .play-button');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Canción del móvil' && document.querySelector('.player .seek-bar__time')?.textContent >= '0:01', null, { timeout: 15000 });
  await page.evaluate(() => {
    const range = document.querySelector('.player .seek-bar__range');
    range.value = '7';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));
  });
  const seeked = await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:07', null, { timeout: 8000 }).then(() => true, () => false);
  check(seeked, 'la canción de la carpeta suena y se puede saltar (rangos servidos por el WebView)');
  const tail = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/_pulse_local_/'))?.name;
    const response = await fetch(url, { headers: { Range: 'bytes=400000-' } });
    return [response.status, (await response.arrayBuffer()).byteLength];
  });
  check(tail[0] === 206 && tail[1] === 441140 - 400000, `un rango a mitad del archivo devuelve solo ese trozo (${tail.join(', ')})`);
  const forbidden = await page.evaluate(() => fetch(`/_pulse_local_/?uri=${encodeURIComponent('content://com.android.externalstorage.documents/tree/primary%3ADCIM/document/primary%3ADCIM')}`).then((response) => response.status));
  check(forbidden === 403, 'el WebView no sirve nada de fuera de las carpetas elegidas');
  await page.click('.view--collection:not([hidden]) .track-row [data-action="more"]');
  check((await page.locator('.menu__item:has-text("Eliminar del bucket")').count()) === 0, 'el «⋯» no ofrece eliminar canciones de las carpetas');
  await shot('11-carpetas-biblioteca');
  await page.keyboard.press('Escape');
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
