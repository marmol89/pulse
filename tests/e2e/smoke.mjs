/**
 * Prueba de humo de la app real (Electron) con playwright-core:
 * levanta un S3 falso con WAV etiquetados, conecta la app desde su formulario,
 * recorre las pantallas, comprueba reproducción desde el bucket, saltos, favoritos,
 * cambios en el bucket, subir canciones del ordenador, la copia en metadatos/ y guarda capturas en tests/e2e/output/. Nunca usa tu S3 real.
 * Uso: npm run test:e2e   (abre la ventana unos segundos; el audio va silenciado)
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createWav } from '../helpers/audio.js';
import { startFakeS3 } from '../helpers/fakeS3.js';
import { encodePng, paint, diagonalGradient } from '../../scripts/lib/png.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('output/', import.meta.url));

function coverPng(from, to) {
  const gradient = diagonalGradient(from, to);
  return encodePng(240, 240, paint(240, 240, (u, v) => [...gradient(u, v), 1]));
}

const NEON = coverPng('#7C5CFF', '#FF5CA8');
const MAREAS = coverPng('#2EC5FF', '#7C5CFF');
const FIXTURES = [
  ['Aurora Vega/Neón/01 Intro.wav', { title: 'Intro', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '1', cover: NEON }],
  [
    'Aurora Vega/Neón/02 Luces de Neón.wav',
    { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '2', cover: NEON, lyrics: 'Brillan las luces\nde la ciudad\ny tú conmigo' },
  ],
  ['Marea Sur/Mareas/Ola Azul.wav', { title: 'Ola Azul', artist: 'Marea Sur', album: 'Mareas', genre: 'Lo-fi chill', cover: MAREAS }],
  ['Los Prismas/Atardecer.wav', { title: 'Atardecer', artist: 'Los Prismas', album: 'Atardecer', genre: 'Pop latino' }],
  ['Kora/Selva.wav', { title: 'Selva', artist: 'Kora', album: 'Verde', genre: 'Lo-fi chill' }],
  ['Sueltas/pista sin etiquetas.wav', null],
];

/** Bucket "musica" con los WAV (10 s: caben en los 512 KB que se leen para las etiquetas). */
function bucketObjects() {
  return Object.fromEntries(FIXTURES.map(([key, tags], index) => [key, createWav({ seconds: 10, frequency: 330 + index * 55, tags })]));
}

const problems = [];
const check = (condition, message) => {
  console.log(`${condition ? '✔' : '✖'} ${message}`);
  if (!condition) problems.push(message);
};

const work = await mkdtemp(path.join(tmpdir(), 'pulse-e2e-'));
const s3 = await startFakeS3({ buckets: { musica: bucketObjects() } });
await mkdir(OUTPUT, { recursive: true });

const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(work, 'perfil')}`], cwd: ROOT });
try {
  const page = await app.firstWindow();
  // Sin animaciones: si la ventana queda tapada, Windows no pinta frames y las
  // transiciones se quedarían a medias en la captura.
  const shot = (name) => page.screenshot({ path: path.join(OUTPUT, `${name}.png`), animations: 'disabled' });
  const logs = [];
  page.on('console', (message) => ['error', 'warning'].includes(message.type()) && logs.push(`[${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
  // Chromium cancela (ERR_ABORTED) la petición de audio en curso al saltar o cambiar de pista: es normal.
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText;
    if (reason !== 'net::ERR_ABORTED') logs.push(`[requestfailed] ${request.url()} ${reason}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith('media:') && response.status() >= 400) logs.push(`[media ${response.status()}] ${response.url()}`);
  });

  // Antes de conectar: audio silenciado y sin datos de internet (la prueba no envía nada a iTunes).
  await page.waitForSelector('.connection[open]');
  await page.evaluate(() => {
    localStorage.setItem('pulse.muted', 'true');
    localStorage.setItem('pulse.onlineLookup', 'false');
  });
  await page.reload();
  await page.waitForSelector('.connection[open]');
  check(true, 'la primera vez se abre el formulario de conexión');
  check((await page.isChecked('.switch')) === false, 'el interruptor "Datos de internet" refleja la preferencia guardada');
  await shot('01-conexion');

  const fillConnection = async (accessKeyId) => {
    await page.fill('#connection-endpoint', s3.endpoint);
    await page.fill('#connection-accessKeyId', accessKeyId);
    await page.fill('#connection-secretAccessKey', s3.config.secretAccessKey);
    await page.click('.connection button[type="submit"]');
  };
  await fillConnection('clave-incorrecta');
  await page.waitForSelector('.connection__error:not([hidden])');
  check((await page.textContent('.connection__error')).includes('claves no son válidas'), 'con claves incorrectas el formulario explica el error');
  await fillConnection(s3.config.accessKeyId);
  await page.waitForSelector('.connection', { state: 'hidden' });
  check(true, 'con claves correctas conecta (sin indicar bucket usa el único que hay)');
  check((await page.textContent('.nav__status')).startsWith('musica'), 'la sidebar muestra el bucket conectado');

  await page.waitForSelector('.feature-card');
  check((await page.locator('.genre-card').count()) === 2, 'Inicio muestra los 2 géneros');
  await shot('02-inicio');

  await page.click('.feature-card .play-button');
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent !== '0:00', null, { timeout: 15000 });
  check(true, 'Mix diario: la pista suena y el tiempo avanza (media:// funciona)');

  await page.click('.player .favorite-button');
  check((await page.getAttribute('.player .favorite-button', 'aria-pressed')) === 'true', 'el corazón marca la pista como favorita');

  const title = await page.textContent('.player__title');
  await page.focus('.player button[aria-label="Siguiente"]');
  await page.keyboard.press(' ');
  await page.waitForSelector('.player .play-button[aria-label="Reproducir"]');
  check((await page.textContent('.player__title')) === title, 'Espacio con el foco en un botón pausa en vez de pulsar el botón');
  await page.keyboard.press(' ');
  await page.waitForSelector('.player .play-button[aria-label="Pausar"]');

  await page.evaluate(() => {
    const range = document.querySelector('.player .seek-bar__range');
    range.value = '7';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:07', null, { timeout: 5000 });
  check(true, 'saltar a 0:07 funciona (rangos de S3)');
  await page.waitForSelector('.card-grid .media-card');
  await shot('03-inicio-con-recientes');

  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForSelector('.view--collection:not([hidden]) .track-row.is-active');
  check((await page.locator('.view--collection .track-row').count()) === FIXTURES.length, 'Biblioteca lista todas las pistas y resalta la actual');
  await shot('04-biblioteca');

  await page.dblclick('.view--collection .track-row:has-text("Luces de Neón")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Luces de Neón');
  check(true, 'doble clic en una fila la reproduce');

  await page.click('.player__cover');
  await page.waitForSelector('.now-playing.is-open');
  check(await page.isVisible('.lyrics'), 'Reproduciendo muestra la tarjeta de letra si la pista tiene letra');
  const info = Object.fromEntries(
    await page.$$eval('.info-card__row', (rows) => rows.map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])),
  );
  check(
    info['Álbum'] === 'Neón' && info['Género'] === 'Pop latino' && info['Pista'] === '2' && info['Datos'] === 'Del archivo',
    `la tarjeta Información muestra los datos: ${JSON.stringify(info)}`,
  );
  await page.click('.lyrics .link-button');
  await shot('05-reproduciendo');
  await page.click('.device__button');
  await page.waitForSelector('.device__menu:not([hidden]) .device__option');
  const devices = await page.locator('.device__option').allTextContents();
  check(devices.every((label) => !/^Default\b|\(\w{4}:\w{4}\)$/.test(label)), `salidas de audio legibles: ${devices.join(' | ')}`);
  await shot('06-salidas-de-audio');

  await page.keyboard.press('Escape');
  check(await page.isHidden('.device__menu'), 'Esc cierra primero el menú de salidas');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.now-playing', { state: 'hidden' });
  check(true, 'Reproduciendo se abre desde la portada y se cierra con Esc');

  await page.click('.nav__item:has-text("Buscar")');
  await page.fill('.search-box__input', 'selva');
  await page.waitForSelector('.view--search .track-row');
  check((await page.locator('.view--search .track-row').count()) === 1, 'Buscar "selva" encuentra 1 pista');
  await shot('07-buscar');

  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.chip:has-text("Álbumes")');
  check((await page.locator('.card-grid .media-card').count()) === 4, 'Álbumes agrupa 4 álbumes');
  await shot('08-albumes');

  s3.put('musica', 'Nuevas/Selva (directo).wav', createWav({ seconds: 3, tags: { title: 'Selva (directo)', artist: 'Kora' } }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '1 canción nueva');
  check(true, '"Actualizar biblioteca" trae la canción subida al bucket');

  // Subir canciones del ordenador: el diálogo de archivos del proceso main se sustituye por uno falso.
  const upload = path.join(work, 'Para subir', 'Brisa.wav');
  await mkdir(path.dirname(upload), { recursive: true });
  await writeFile(upload, createWav({ seconds: 3, tags: { title: 'Brisa', artist: 'Marea Sur', album: 'Mareas', genre: 'Lo-fi chill' } }));
  const fakeDialog = (filePaths) =>
    app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
    }, filePaths);
  await fakeDialog([upload]);
  await page.click('.nav__item:has-text("Subir canciones")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '1 canción subida', null, { timeout: 10000 });
  check(s3.get('musica', 'Brisa.wav')?.length > 0, '"Subir canciones" sube el archivo elegido al bucket');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForSelector('.view--collection .track-row:has-text("Brisa")');
  check(true, 'la canción subida aparece en la biblioteca con sus etiquetas');

  await page.click('.nav__item:has-text("Subir canciones")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '1 ya estaba en el bucket');
  check(true, 'subir otra vez el mismo archivo no lo duplica');

  // Soltar en la ventana: un File creado en la página no tiene ruta en disco, así que no hay nada que subir.
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'nota.txt'));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'No hay canciones de audio en lo que has elegido');
  check(!(await page.locator('.app.is-dropping').count()), 'soltar archivos en la ventana llega a la subida y quita el aviso de soltar');

  // Los metadatos se copian al bucket, en metadatos/biblioteca.json (unos segundos después de guardarse).
  const savedMetadata = async () => {
    for (let i = 0; i < 40; i += 1) {
      const body = s3.get('musica', 'metadatos/biblioteca.json');
      const tracks = body ? JSON.parse(body.toString()).tracks : [];
      if (tracks.some((track) => track.title === 'Brisa')) return tracks;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return [];
  };
  const metadataTracks = await savedMetadata();
  check(
    metadataTracks.length === FIXTURES.length + 2 && metadataTracks.find((track) => track.title === 'Luces de Neón')?.album === 'Neón',
    `los metadatos se guardan en metadatos/biblioteca.json del bucket (${metadataTracks.length} canciones)`,
  );

  s3.setReadOnly(true);
  const denied = path.join(work, 'Para subir', 'Sin permiso.wav');
  await writeFile(denied, createWav({ seconds: 1 }));
  await fakeDialog([denied]);
  await page.click('.nav__item:has-text("Subir canciones")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('no tienen permiso para subir'));
  check((await page.getAttribute('.toast', 'data-tone')) === 'error', 'con claves de solo lectura explica que no hay permiso para subir');
  s3.setReadOnly(false);
  await shot('09-subir-sin-permiso');

  check(logs.length === 0, `sin errores de consola${logs.length ? `:\n  ${logs.join('\n  ')}` : ''}`);

  // Canción borrada del bucket con la app abierta (aquí el 404 en la consola es lo esperado).
  s3.remove('musica', 'Los Prismas/Atardecer.wav');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.dblclick('.view--collection .track-row:has-text("Atardecer")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('ya no está en el bucket'));
  check(
    (await page.locator('.view--collection .track-row:has-text("Atardecer")').count()) === 0,
    'una canción borrada del bucket se quita al intentar reproducirla',
  );
} finally {
  await app.close();
  await s3.close();
  await rm(work, { recursive: true, force: true });
}

console.log(problems.length ? `\n${problems.length} comprobación(es) fallida(s)` : `\nTodo correcto. Capturas en ${OUTPUT}`);
process.exit(problems.length ? 1 : 0);
