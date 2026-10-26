/**
 * Capturas de la app real (Electron) con la ventana a ancho de móvil (412×915, como un Pixel) contra el
 * S3 falso: recorre las pantallas y guarda una imagen de cada una en tests/e2e/output/movil/.
 * Es rápido (no hace falta el emulador) y sirve para revisar el diseño móvil (`@media (max-width: 720px)`).
 * Uso: node .claude/skills/revisar-interfaz/capturas-movil.mjs
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { bucketObjects } from '../../../tests/e2e/fixtures.js';
import { startFakeS3 } from '../../../tests/helpers/fakeS3.js';
import { createWav } from '../../../tests/helpers/audio.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../../../tests/e2e/output/movil/', import.meta.url));
const ROW = '.view--collection:not([hidden]) .track-row';

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
const work = await mkdtemp(path.join(tmpdir(), 'pulse-movil-'));
const s3 = await startFakeS3({ buckets: { musica: bucketObjects() } });
const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(work, 'perfil')}`], cwd: ROOT });
const page = await app.firstWindow();
const shot = async (name) => {
  await page.waitForTimeout(400); // que terminen las transiciones
  await page.screenshot({ path: path.join(OUTPUT, `${name}.png`), animations: 'disabled' });
};
const step = async (name, action) => {
  try {
    await action();
  } catch (error) {
    console.error(`✖ ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
};

try {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setMinimumSize(300, 400);
    window.setContentSize(412, 915);
  });
  // Audio silenciado y sin datos de internet: nunca se llama a servicios reales.
  await page.waitForSelector('.connection[open]');
  await page.evaluate(() => {
    localStorage.setItem('pulse.muted', 'true');
    localStorage.setItem('pulse.onlineLookup', 'false');
  });
  await page.reload();
  await page.waitForSelector('.connection[open]');
  await shot('01-conexion');
  await page.fill('#connection-endpoint', s3.endpoint);
  await page.fill('#connection-accessKeyId', s3.config.accessKeyId);
  await page.fill('#connection-secretAccessKey', s3.config.secretAccessKey);
  await page.click('.connection button[type="submit"]');
  await page.waitForSelector('.feature-card');
  await shot('02-inicio');

  await step('Inicio sonando', async () => {
    await page.click('.feature-card .play-button');
    await page.waitForSelector('.player .play-button[aria-label="Pausar"]');
    await page.evaluate(() => document.querySelector('.main')?.scrollTo(0, 99999));
    await shot('03-inicio-abajo');
  });
  await step('Tu música', async () => {
    await page.click('.nav__item--menu');
    await shot('04-tu-musica');
    await page.click('.nav__item--menu');
  });
  await step('Biblioteca', async () => {
    await page.click('.sidebar .nav__item:has-text("Biblioteca")');
    await page.waitForSelector(ROW);
    await shot('05-biblioteca');
    await page.evaluate(() => document.querySelector('.view--collection:not([hidden]) .track-list')?.scrollIntoView());
    await shot('05b-biblioteca-filas');
    await page.click(`${ROW} >> nth=1 >> [data-action="more"]`);
    await shot('05c-menu-fila');
    await page.click('.menu__item:has-text("Editar datos")');
    await page.waitForSelector('#track-edit-dialog[open]');
    await shot('05d-editar-datos');
    await page.evaluate(() => document.querySelector('#track-edit-dialog .connection__actions')?.scrollIntoView());
    await shot('05e-editar-datos-abajo');
    await page.keyboard.press('Escape'); // Esc cierra el diálogo (los atajos no se lo quitan)
    await page.waitForSelector('#track-edit-dialog:not([open])', { state: 'attached' });
  });
  await step('Buscar', async () => {
    await page.click('.sidebar .nav__item:has-text("Buscar")');
    await page.fill('.view--search input', 'a');
    await page.waitForSelector('.view--search .track-row');
    await shot('06-buscar');
  });
  await step('Inicio › chips', async () => {
    await page.click('.sidebar .nav__item:has-text("Inicio")');
    for (const [chip, name] of [['Álbumes', '07-albumes'], ['Artistas', '07b-artistas'], ['Favoritos', '07c-favoritos'], ['Listas', '07d-listas']]) {
      await page.click(`.view:not([hidden]) .chip:has-text("${chip}")`);
      await shot(name);
    }
  });
  await step('Lista', async () => {
    await page.click('.view:not([hidden]) .media-card:has-text("Nueva lista")');
    await page.waitForSelector('.list-dialog[open]');
    await shot('08-nueva-lista');
    // Un nombre largo a propósito: así se ve si los títulos largos rompen algo.
    await page.fill('#list-dialog-name', 'Para correr un domingo por la mañana');
    await page.click('.list-dialog button[type="submit"]');
    await page.waitForSelector('.view--collection:not([hidden]) .collection-header__title');
    await shot('09-lista-vacia');
    await page.click('.sidebar .nav__item:has-text("Biblioteca")');
    for (const nth of [0, 2]) {
      await page.click(`${ROW} >> nth=${nth} >> [data-action="more"]`);
      await page.click('.menu__item:has-text("Añadir a una lista")');
      await page.waitForSelector('.list-dialog[open] .list-picker__item');
      if (nth === 0) await shot('10-anadir-a-lista');
      await page.click('.list-picker__item >> nth=0');
    }
    await page.click('.sidebar .nav__item:has-text("Inicio")');
    await page.click('.view:not([hidden]) .media-card:has-text("Para correr")');
    await page.waitForSelector(ROW);
    await page.evaluate(() => document.querySelector('.view--collection:not([hidden]) .track-list')?.scrollIntoView());
    await shot('11-lista');
    await page.click(`${ROW} >> nth=0 >> [data-action="more"]`);
    await shot('11b-menu-fila-lista');
    await page.keyboard.press('Escape');
    await page.click('.collection-actions__more');
    await shot('11c-menu-lista');
    await page.click('.menu__item:has-text("Editar lista")');
    await shot('12-editar-lista');
    await page.click('.list-dialog button:has-text("Cancelar")');
  });
  await step('Reproduciendo', async () => {
    await page.click('.player__cover');
    await page.waitForSelector('.now-playing.is-open');
    await shot('13-reproduciendo');
    await page.evaluate(() => document.querySelector('.now-playing')?.scrollTo(0, 99999));
    await shot('13b-reproduciendo-abajo');
    await page.click('.now-playing [aria-label="Ver la cola"]');
    await page.waitForSelector(ROW);
    await shot('14-cola');
  });
  await step('Papelera', async () => {
    await page.click('.nav__item--menu');
    await page.click('.nav__item:has-text("Papelera")');
    await page.waitForSelector('.trash-dialog[open]');
    await shot('15-papelera');
    await page.click('.trash-dialog .link-button:has-text("Cerrar")');
  });
  await step('Carpetas', async () => {
    // Una carpeta de nombre largo con una canción: el selector de carpetas del sistema se sustituye por uno falso.
    const folder = path.join(work, 'Música descargada del ordenador viejo');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'Local.wav'), createWav({ seconds: 2, tags: { title: 'Canción Local', artist: 'Río Claro' } }));
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
    }, [folder]);
    await page.click('.nav__item--menu');
    await page.click('.nav__item:has-text("Conexión")');
    await page.click('#connection-tab-local');
    await shot('16-conexion-carpetas-vacia');
    await page.click('#connection-add-folder');
    await page.waitForSelector('.connection__folders .list-picker__item');
    await shot('16b-conexion-carpetas');
    await page.click('.connection button[type="submit"]');
    await page.waitForSelector('.connection', { state: 'hidden' });
    await page.click('.nav__item--menu');
    await shot('17-tu-musica-carpetas');
    await page.click('.nav__item--menu');
    await page.click('.sidebar .nav__item:has-text("Biblioteca")');
    await page.waitForFunction((row) => document.querySelectorAll(row).length === 1, ROW);
    await page.click(`${ROW} >> nth=0 >> [data-action="more"]`);
    await shot('17b-menu-fila-carpetas');
    await page.keyboard.press('Escape');
  });
  // Nada debe dar scroll horizontal: es la señal más clara de que algo se sale de la pantalla.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) {
    console.error('✖ hay scroll horizontal: algo se sale de la pantalla');
    process.exitCode = 1;
  }
  console.log(`Capturas en ${OUTPUT}`);
} finally {
  await app.close();
  await s3.close?.();
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
