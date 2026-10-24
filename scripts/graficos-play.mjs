/**
 * Gráficos de la ficha de Google Play en docs/play/:
 * - capturas del móvil (1080×1920): la app real (Electron) con el diseño móvil, contra un S3 falso
 *   con canciones de ejemplo (nunca usa tu S3 real ni servicios de internet);
 * - gráfico de funciones (1024×500), pintado con los tokens del diseño y una de esas capturas.
 * El icono de 512×512 lo genera `npm run icons` (docs/play/icono-512.png).
 * Uso: npm run play:graficos   (abre la ventana unos segundos; el audio va silenciado)
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createWav } from '../tests/helpers/audio.js';
import { startFakeS3 } from '../tests/helpers/fakeS3.js';
import { encodePng, paint, diagonalGradient } from './lib/png.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../docs/play/', import.meta.url));
// Teléfono de 405×720 dp a 8/3 → capturas de 1080×1920 (9:16, lo que pide Google Play).
const PHONE = { width: 405, height: 720, deviceScaleFactor: 8 / 3 };

const cover = (from, to) => {
  const gradient = diagonalGradient(from, to);
  return encodePng(240, 240, paint(240, 240, (u, v) => [...gradient(u, v), 1]));
};
const COVERS = {
  neon: cover('#7C5CFF', '#FF5CA8'),
  mareas: cover('#2EC5FF', '#7C5CFF'),
  ocaso: cover('#FFB25C', '#FF5CA8'),
  verde: cover('#3DDC97', '#2EC5FF'),
};
const SONGS = [
  ['Aurora Vega/Neón/01 Luces de Neón.mp3', 'Luces de Neón', 'Aurora Vega', 'Neón', 'Pop latino', 'neon', 'Brillan las luces\nde la ciudad\ny tú conmigo\nbailando sin final'],
  ['Aurora Vega/Neón/02 Medianoche.mp3', 'Medianoche', 'Aurora Vega', 'Neón', 'Pop latino', 'neon'],
  ['Aurora Vega/Neón/03 Cristal.mp3', 'Cristal', 'Aurora Vega', 'Neón', 'Pop latino', 'neon'],
  ['Marea Sur/Mareas/Ola Azul.mp3', 'Ola Azul', 'Marea Sur', 'Mareas', 'Lo-fi chill', 'mareas'],
  ['Marea Sur/Mareas/Bajamar.mp3', 'Bajamar', 'Marea Sur', 'Mareas', 'Lo-fi chill', 'mareas'],
  ['Los Prismas/Ocaso/Atardecer.mp3', 'Atardecer', 'Los Prismas', 'Ocaso', 'Indie', 'ocaso'],
  ['Los Prismas/Ocaso/Carretera.mp3', 'Carretera', 'Los Prismas', 'Ocaso', 'Indie', 'ocaso'],
  ['Kora/Verde/Selva.mp3', 'Selva', 'Kora', 'Verde', 'Electrónica', 'verde'],
  ['Kora/Verde/Raíces.mp3', 'Raíces', 'Kora', 'Verde', 'Electrónica', 'verde'],
];
const bucket = Object.fromEntries(
  SONGS.map(([key, title, artist, album, genre, art, lyrics], index) => [
    key.replace(/\.mp3$/, '.wav'),
    createWav({ seconds: 10, frequency: 330 + index * 40, tags: { title, artist, album, genre, track: String(index + 1), cover: COVERS[art], lyrics } }),
  ]),
);

const work = await mkdtemp(path.join(tmpdir(), 'pulse-play-'));
const s3 = await startFakeS3({ buckets: { musica: bucket } });
await mkdir(OUTPUT, { recursive: true });

const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(work, 'perfil')}`], cwd: ROOT });
try {
  const page = await app.firstWindow();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...PHONE, mobile: true });
  // Captura de CDP: respeta la escala emulada (la de Playwright usa la de Windows).
  const capture = async (session, name) => {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(OUTPUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`✔ ${name}.png`);
  };
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await capture(cdp, name);
  };

  await page.waitForSelector('.connection[open]');
  await page.evaluate(() => {
    localStorage.setItem('pulse.muted', 'true');
    localStorage.setItem('pulse.onlineLookup', 'false');
  });
  await page.reload();
  await page.waitForSelector('.connection[open]');
  await page.fill('#connection-endpoint', s3.endpoint);
  await page.fill('#connection-accessKeyId', s3.config.accessKeyId);
  await page.fill('#connection-secretAccessKey', s3.config.secretAccessKey);
  await page.click('.connection button[type="submit"]');
  await page.waitForSelector('.feature-card');
  // Ni avisos de la sincronización, ni barras de scroll de escritorio (en el móvil no hay),
  // ni el selector de salida de audio (enseñaría los altavoces de este ordenador).
  // Con insertRule: la CSP de la app no deja añadir <style>.
  await page.evaluate(() => {
    const sheet = [...document.styleSheets].at(-1);
    sheet.insertRule('.toast { display: none !important; }', sheet.cssRules.length);
    sheet.insertRule('::-webkit-scrollbar { display: none; }', sheet.cssRules.length);
    sheet.insertRule('.device { display: none !important; }', sheet.cssRules.length);
  });

  // Algo sonando (con un favorito) para que Inicio tenga recientes y mini-player.
  await page.click('.feature-card .play-button');
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__range')?.value > 0, null, { timeout: 15000 });
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.dblclick('.view--collection .track-row:has-text("Luces de Neón")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Luces de Neón');
  await page.click('.player .favorite-button');
  await page.waitForSelector('.view--collection .track-row img');
  // Desde el título: así se ven más canciones.
  await page.evaluate(() => document.querySelector('.view--collection:not([hidden]) h1')?.scrollIntoView({ block: 'start' }));
  await shot('captura-2-biblioteca');

  await page.click('.nav__item:has-text("Inicio")');
  await page.waitForSelector('.card-grid .media-card');
  await page.evaluate(() => document.querySelector('.view:not([hidden])')?.scrollTo(0, 0));
  await shot('captura-1-inicio');

  await page.click('.player__cover');
  await page.waitForSelector('.now-playing.is-open');
  await shot('captura-3-reproduciendo');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.now-playing', { state: 'hidden' });

  await page.click('.nav__item:has-text("Buscar")');
  await page.fill('.search-box__input', 'kora');
  await page.waitForSelector('.view--search .track-row');
  await shot('captura-4-buscar');

  // Gráfico de funciones: una ventana aparte con su propio HTML (sin la CSP de la app).
  const screenshot = (await readFile(path.join(OUTPUT, 'captura-1-inicio.png'))).toString('base64');
  const html = path.join(work, 'grafico.html');
  await writeFile(html, featureGraphic(screenshot));
  const [graphic] = await Promise.all([
    app.waitForEvent('window'),
    app.evaluate(({ BrowserWindow }, url) => new BrowserWindow({ width: 1024, height: 500, useContentSize: true }).loadURL(url), pathToFileURL(html).href),
  ]);
  const graphicCdp = await graphic.context().newCDPSession(graphic);
  await graphicCdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
  await graphic.waitForLoadState();
  await graphic.evaluate(() => document.fonts.ready);
  await capture(graphicCdp, 'grafico-funciones');
} finally {
  await app.close();
  await s3.close();
}
console.log(`\nGráficos en ${OUTPUT}`);

function featureGraphic(screenshot) {
  const fonts = pathToFileURL(path.join(ROOT, 'node_modules/@fontsource/inter/files/')).href;
  const font = (weight) =>
    `@font-face { font-family: Inter; font-weight: ${weight}; src: url(${fonts}inter-latin-${weight}-normal.woff2) format('woff2'); }`;
  return `<!doctype html><meta charset="utf-8"><style>
    ${font(400)} ${font(800)}
    * { margin: 0; box-sizing: border-box; }
    body { width: 1024px; height: 500px; overflow: hidden; font-family: Inter, sans-serif; color: #fff;
      background: linear-gradient(135deg, #7c5cff, #ff5ca8); position: relative; }
    .decor { position: absolute; border-radius: 50%; background: rgb(255 255 255 / 0.08); }
    .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .logo { display: flex; align-items: center; gap: 18px; font-size: 64px; font-weight: 800; letter-spacing: -1px; }
    .logo svg { width: 76px; height: 76px; }
    p { font-size: 30px; line-height: 1.3; font-weight: 400; color: rgb(255 255 255 / 0.92); }
    .phone { position: absolute; right: 90px; top: 40px; width: 270px; border-radius: 34px; border: 8px solid #14141a;
      overflow: hidden; box-shadow: 0 30px 60px rgb(14 14 18 / 0.45); transform: rotate(6deg); }
    .phone img { display: block; width: 100%; }
  </style>
  <div class="decor" style="width:420px;height:420px;right:-120px;top:-160px"></div>
  <div class="decor" style="width:260px;height:260px;left:-90px;bottom:-120px"></div>
  <div class="text">
    <div class="logo"><svg viewBox="-12 -12 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-11 0 H-6 L-3 -7 L1 7 L4 -3 L6 0 H11"/></svg>Pulse</div>
    <p>Tu música, desde tu propio almacenamiento S3. Con carátulas, letras y en segundo plano.</p>
  </div>
  <div class="phone"><img src="data:image/png;base64,${screenshot}"></div>`;
}
