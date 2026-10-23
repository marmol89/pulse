/**
 * Prueba de humo de la app real (Electron) con playwright-core:
 * genera una biblioteca de WAV con etiquetas, recorre las pantallas,
 * comprueba reproducción, saltos y favoritos, y guarda capturas en tests/e2e/output/.
 * Uso: npm run test:e2e   (abre la ventana unos segundos; el audio va silenciado)
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createWav } from '../helpers/audio.js';
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

async function createLibrary(dir) {
  for (const [index, [file, tags]] of FIXTURES.entries()) {
    const target = path.join(dir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, createWav({ seconds: 12, frequency: 330 + index * 55, tags }));
  }
}

const problems = [];
const check = (condition, message) => {
  console.log(`${condition ? '✔' : '✖'} ${message}`);
  if (!condition) problems.push(message);
};

const work = await mkdtemp(path.join(tmpdir(), 'pulse-e2e-'));
const music = path.join(work, 'Música');
await createLibrary(music);
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

  await page.waitForSelector('.welcome-card');
  check(true, 'biblioteca vacía: se muestra la bienvenida');
  await shot('01-bienvenida');

  const imported = await page.evaluate((dir) => window.api.importPaths([dir]), music);
  check(imported.length === FIXTURES.length, `importa ${imported.length}/${FIXTURES.length} pistas`);
  await page.evaluate(() => localStorage.setItem('pulse.muted', 'true'));
  await page.reload();

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
    range.value = '9';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:09', null, { timeout: 5000 });
  check(true, 'saltar a 0:09 funciona (rangos HTTP)');
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

  check(logs.length === 0, `sin errores de consola${logs.length ? `:\n  ${logs.join('\n  ')}` : ''}`);
} finally {
  await app.close();
  await rm(work, { recursive: true, force: true });
}

console.log(problems.length ? `\n${problems.length} comprobación(es) fallida(s)` : `\nTodo correcto. Capturas en ${OUTPUT}`);
process.exit(problems.length ? 1 : 0);
