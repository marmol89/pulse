/**
 * Prueba de humo de la app real (Electron) con playwright-core:
 * levanta un S3 falso con WAV etiquetados, conecta la app desde su formulario,
 * recorre las pantallas, comprueba reproducción desde el bucket, saltos, favoritos,
 * cambios en el bucket, subir canciones del ordenador, la copia en metadatos/ y guarda capturas en tests/e2e/output/. Nunca usa tu S3 real.
 * Uso: npm run test:e2e   (abre la ventana unos segundos; el audio va silenciado)
 */
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createWav } from '../helpers/audio.js';
import { FIXTURES, bucketObjects, KORA_PICTURE } from './fixtures.js';
import { startFakeS3 } from '../helpers/fakeS3.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('output/', import.meta.url));

const problems = [];
const check = (condition, message) => {
  console.log(`${condition ? '✔' : '✖'} ${message}`);
  if (!condition) problems.push(message);
};

const work = await mkdtemp(path.join(tmpdir(), 'pulse-e2e-'));
const s3 = await startFakeS3({ buckets: { musica: bucketObjects() } });
await mkdir(OUTPUT, { recursive: true });

// Una foto de artista ya encontrada en otra sesión (sin internet en la prueba): artists.json y covers/.
await mkdir(path.join(work, 'perfil', 'covers'), { recursive: true });
await writeFile(path.join(work, 'perfil', 'covers', 'e2e-kora.jpg'), KORA_PICTURE);
await writeFile(path.join(work, 'perfil', 'artists.json'), JSON.stringify({ Kora: { coverName: 'e2e-kora.jpg', checkedAt: 1 } }));

const launch = () => electron.launch({ args: ['.', `--user-data-dir=${path.join(work, 'perfil')}`], cwd: ROOT });
let app = await launch();
try {
  let page = await app.firstWindow();
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

  const rowTitles = () => page.$$eval('.view--collection .track-row__title', (titles) => titles.map((title) => title.textContent));
  await page.fill('.library-tools__input', 'aurora');
  await page.waitForFunction(() => document.querySelectorAll('.view--collection .track-row').length === 2);
  check((await rowTitles()).join() === 'Intro,Luces de Neón', 'el filtro de la biblioteca deja solo las canciones que coinciden');
  await shot('04d-biblioteca-filtrada');
  await page.fill('.library-tools__input', 'nada de esto');
  await page.waitForSelector('.view--collection .hint:not([hidden]):has-text("Ninguna canción coincide")');
  check(true, 'sin coincidencias, la biblioteca lo dice');
  await page.fill('.library-tools__input', '');
  await page.selectOption('.library-tools__sort', 'artist');
  await page.waitForFunction(() => document.querySelectorAll('.view--collection .track-row__title')[1]?.textContent === 'Intro');
  check((await rowTitles()).slice(0, 4).join() === 'pista sin etiquetas,Intro,Luces de Neón,Selva', 'ordenar por artista agrupa las de cada artista');
  await page.selectOption('.library-tools__sort', 'added');

  await page.dblclick('.view--collection .track-row:has-text("Luces de Neón")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Luces de Neón');
  check(true, 'doble clic en una fila la reproduce');

  // Cola editable: "⋯" › "Reproducir a continuación" y "Ver la cola" desde Reproduciendo.
  await page.click('.view--collection .track-row:has-text("Atardecer") [data-action="more"]');
  await page.waitForSelector('.menu .menu__item');
  await shot('04b-menu-fila');
  await page.click('.menu__item:has-text("Reproducir a continuación")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Sonará a continuación');
  await page.click('.player__cover');
  await page.waitForSelector('.now-playing.is-open');
  await page.click('.now-playing [aria-label="Ver la cola"]');
  await page.waitForSelector('.view--collection:not([hidden]) .track-row.is-active');
  const queueTitles = await page.$$eval('.view--collection .track-row .track-row__title', (rows) => rows.map((row) => row.textContent));
  const playingAt = queueTitles.indexOf('Luces de Neón');
  check(playingAt >= 0 && queueTitles[playingAt + 1] === 'Atardecer', `"Reproducir a continuación" la pone detrás de la que suena (${queueTitles.join(', ')})`);
  await page.click('.view--collection .track-row:has-text("Atardecer") [data-action="remove"]');
  await page.waitForFunction(() => ![...document.querySelectorAll('.view--collection .track-row__title')].some((row) => row.textContent === 'Atardecer'));
  check(true, '"Ver la cola" deja quitar canciones');
  await shot('04c-cola');

  // Reordenar arrastrando el asa (pointer events) y con Alt+↑.
  const queueOrder = () => page.$$eval('.view--collection .track-row .track-row__title', (rows) => rows.map((row) => row.textContent));
  const beforeDrag = await queueOrder();
  const lastTitle = beforeDrag.at(-1);
  const grip = await page.locator(`.view--collection .track-row:has-text("${lastTitle}") .track-row__grip`).boundingBox();
  const firstRow = await page.locator('.view--collection .track-row').first().boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, firstRow.y + 5, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((title) => document.querySelector('.view--collection .track-row .track-row__title')?.textContent === title, lastTitle, { timeout: 3000 }).catch(() => {});
  const afterDrag = await queueOrder();
  check(afterDrag[0] === lastTitle && afterDrag.length === beforeDrag.length, `arrastrar el asa cambia el orden de la cola (${afterDrag.join(', ')})`);
  await page.focus(`.view--collection .track-row:has-text("${afterDrag[1]}")`);
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForFunction((title) => document.querySelector('.view--collection .track-row .track-row__title')?.textContent === title, afterDrag[1], { timeout: 3000 }).catch(() => {});
  check((await queueOrder())[0] === afterDrag[1], 'Alt+↑ sube la canción con el foco');

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

  // Temporizador de apagado: 30 minutos → "Hasta las HH:MM"; después, desactivado.
  await page.click('.sleep-timer .device__button');
  await page.click('.sleep-timer .device__option:has-text("30 minutos")');
  await page.waitForFunction(() => /^Hasta las \d\d:\d\d$/.test(document.querySelector('.sleep-timer .device__button span')?.textContent ?? ''));
  check(true, 'el temporizador de apagado dice hasta qué hora suena');
  await shot('06b-temporizador');
  await page.click('.sleep-timer .device__button');
  await page.click('.sleep-timer .device__option:has-text("Desactivado")');
  await page.waitForFunction(() => document.querySelector('.sleep-timer .device__button span')?.hidden === true);
  check(true, 'el temporizador se puede desactivar');
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
  const loadedCovers = await page
    .waitForFunction(() => [...document.querySelectorAll('.card-grid .cover__image')].filter((image) => image.complete && image.naturalWidth > 0).length >= 2, null, { timeout: 5000 })
    .then(() => true, () => false);
  const savedCovers = (await readdir(path.join(work, 'perfil', 'covers')).catch(() => [])).filter((name) => name.startsWith('embedded-'));
  check(loadedCovers && savedCovers.length >= 2, `las carátulas incrustadas se ven y quedan guardadas en covers/ (${savedCovers.length})`);
  await shot('08-albumes');

  const guest = 'Invitada Con Un Nombre Larguísimo Que No Cabe';
  s3.put('musica', 'Nuevas/Selva (directo).wav', createWav({ seconds: 3, tags: { title: 'Selva (directo)', artist: `Kora, ${guest} & Aurora Vega` } }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '1 canción nueva');
  check(true, '"Actualizar biblioteca" trae la canción subida al bucket');

  // Artistas: una colaboración cuenta para cada artista y los nombres largos no se salen de su tarjeta.
  await page.click('.chip:has-text("Artistas")');
  const artistCards = await page.$$eval('.card-grid .media-card', (cards) =>
    cards.map((card) => {
      const title = card.querySelector('.media-card__title');
      const box = card.getBoundingClientRect();
      const text = title.getBoundingClientRect();
      return { name: title.textContent, count: card.querySelector('.media-card__subtitle').textContent, inside: text.left >= box.left - 1 && text.right <= box.right + 1 };
    }),
  );
  const cardOf = (name) => artistCards.find((card) => card.name === name);
  check(cardOf('Kora')?.count === '2 canciones' && cardOf('Aurora Vega')?.count === '3 canciones' && Boolean(cardOf(guest)), 'Artistas separa las colaboraciones');
  check(artistCards.every((card) => card.inside), 'Artistas: los nombres largos no se salen de su tarjeta');
  await page.waitForFunction(() => {
    const image = [...document.querySelectorAll('.card-grid .media-card')].find((card) => card.querySelector('.media-card__title').textContent === 'Kora')?.querySelector('img');
    return image?.src.startsWith('media://artist/') && image.complete && image.naturalWidth > 0;
  });
  check(true, 'Artistas muestra la foto guardada del artista (media://artist/)');
  await shot('08b-artistas');

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

  // Otro equipo encontró la letra sincronizada de "Luces de Neón": llega con los metadatos del bucket.
  const synced = metadataTracks.map((track) =>
    track.title === 'Luces de Neón'
      ? { ...track, syncedLyrics: '[00:00.00]Brillan las luces\n[00:03.00]de la ciudad\n[00:06.00]y tú conmigo', online: { ...track.online, lyricsCheckedAt: Date.now() } }
      : track,
  );
  s3.put('musica', 'metadatos/biblioteca.json', JSON.stringify({ ...JSON.parse(s3.get('musica', 'metadatos/biblioteca.json').toString()), tracks: synced }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.dblclick('.view--collection .track-row:has-text("Luces de Neón")');
  await page.click('.player__cover');
  await page.waitForSelector('.now-playing.is-open .lyrics__line');
  if ((await page.getAttribute('.lyrics .link-button', 'aria-expanded')) === 'false') await page.click('.lyrics .link-button');
  await page.click('.lyrics__line:has-text("y tú conmigo")');
  await page.waitForSelector('.lyrics__line.is-active:has-text("y tú conmigo")');
  check((await page.textContent('.now-playing .seek-bar__time')) >= '0:06', 'la letra sincronizada resalta el verso que suena y pulsar uno salta a él');
  await shot('05b-letra-sincronizada');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.now-playing', { state: 'hidden' });

  // Listas de canciones: se crean en la app y se comparten en metadatos/listas.json del bucket.
  await page.click('.sidebar__lists .nav__item:has-text("Nueva lista")');
  await page.waitForSelector('.list-dialog[open]');
  await page.fill('#list-dialog-name', 'Para correr');
  await page.click('.list-dialog button[type="submit"]');
  await page.waitForSelector('.view--collection:not([hidden]) .collection-header__title:has-text("Para correr")');
  check(await page.isVisible('.collection-actions__edit'), '"Nueva lista" crea la lista y la abre, con "Editar lista"');
  await shot('10-lista-vacia');

  await page.click('.nav__item:has-text("Biblioteca")');
  const selva = page.locator('.view--collection .track-row:has-text("Selva")').first();
  await selva.hover();
  await selva.locator('[data-action="add"]').click();
  await page.waitForSelector('.list-dialog[open] .list-picker__item:has-text("Para correr")');
  await shot('11-anadir-a-lista');
  await page.click('.list-picker__item:has-text("Para correr")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Añadida a «Para correr»');
  check(true, '"+" en una fila añade la canción a la lista elegida');

  await page.click('.player__cover');
  await page.click('.now-playing__add');
  await page.fill('#list-dialog-name', 'En el coche');
  await page.click('.list-dialog button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Lista «En el coche» creada con 1 canción');
  check(true, 'desde Reproduciendo se crea una lista con la canción que suena');
  await page.keyboard.press('Escape');

  await page.click('.sidebar__lists .nav__item:has-text("Para correr")');
  await page.waitForSelector('.view--collection .track-row:has-text("Selva")');
  check((await page.locator('.view--collection .track-row').count()) === 1, 'la lista muestra sus canciones');
  await shot('12-lista');

  // Exportar la lista como M3U: "⋯" › "Exportar (.m3u8)" con el diálogo de guardar sustituido por uno falso.
  const exported = path.join(work, 'Para correr.m3u8');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exported);
  await page.click('.collection-actions__more');
  await shot('12b-lista-menu');
  await page.click('.menu__item:has-text("Exportar")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '«Para correr» exportada (1 canción)');
  const m3u = await readFile(exported, 'utf8');
  check(m3u.startsWith('#EXTM3U\n#EXTINF:3,') && m3u.includes('\nNuevas/Selva (directo).wav\n'), '"Exportar (.m3u8)" guarda la lista con la ruta de cada canción');

  const remoteLists = async (match) => {
    for (let i = 0; i < 40; i += 1) {
      const body = s3.get('musica', 'metadatos/listas.json');
      const lists = body ? JSON.parse(body.toString()).lists : [];
      if (match(lists)) return lists;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  };
  const uploaded = await remoteLists((lists) => lists.filter((list) => !list.deleted).length === 2);
  check(
    uploaded?.find((list) => list.name === 'Para correr')?.tracks.length === 1,
    'las listas se guardan en metadatos/listas.json del bucket',
  );

  // Otro equipo añade una lista al bucket: llega con "Actualizar biblioteca".
  const now = Date.now();
  const fromPhone = { id: 'del-movil', name: 'Del móvil', tracks: ['s3://musica/Kora/Selva.wav'], createdAt: now, updatedAt: now };
  s3.put('musica', 'metadatos/listas.json', JSON.stringify({ version: 1, lists: [...uploaded, fromPhone] }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.waitForSelector('.sidebar__lists .nav__item:has-text("Del móvil")');
  check(true, 'una lista creada en otro equipo aparece al actualizar');

  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.chip:has-text("Listas")');
  check((await page.locator('.card-grid .media-card').count()) === 4, 'Inicio › Listas muestra las 3 listas y "Nueva lista"');
  await shot('13-inicio-listas');

  await page.click('.sidebar__lists .nav__item:has-text("Para correr")');
  await page.click('.collection-actions__edit');
  await page.click('.list-dialog__delete');
  await page.click('.list-dialog__delete');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Lista «Para correr» eliminada');
  check((await page.locator('.sidebar__lists .nav__item:has-text("Para correr")').count()) === 0, '"Editar lista" › eliminar (con confirmación) la quita');
  check(
    (await remoteLists((lists) => lists.some((list) => list.deleted))) !== null,
    'la lista eliminada queda marcada en el bucket para que los demás equipos también la quiten',
  );

  // Importar la lista exportada (con una canción que no está en la biblioteca): vuelve como lista nueva.
  await writeFile(exported, `${m3u}#EXTINF:100,Nadie - No está\r\nD:\\Música\\no-esta.mp3\r\n`);
  await fakeDialog([exported]);
  await page.click('.nav__item:has-text("Importar lista")');
  await page.waitForSelector('.view--collection:not([hidden]) .collection-header__title:has-text("Para correr")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Lista importada con 1 canción; falta 1 que no está en tu biblioteca');
  check((await page.locator('.view--collection .track-row:has-text("Selva")').count()) === 1, '"Importar lista" crea la lista con las canciones que están en la biblioteca');
  await shot('13b-lista-importada');

  // Recientes: lo que ha sonado está en metadatos/recientes.json; uno de otro equipo sale el primero al actualizar.
  let recentsInBucket = [];
  for (let i = 0; i < 40 && recentsInBucket.length === 0; i += 1) {
    const body = s3.get('musica', 'metadatos/recientes.json');
    recentsInBucket = body ? JSON.parse(body.toString()).recents : [];
    if (recentsInBucket.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(recentsInBucket.length > 0, `lo escuchado se guarda en metadatos/recientes.json del bucket (${recentsInBucket.length})`);
  const recentAt = Date.now() + 60_000;
  s3.put('musica', 'metadatos/recientes.json', JSON.stringify({ version: 1, recents: [...recentsInBucket, { id: 's3://musica/Sueltas/pista sin etiquetas.wav', createdAt: recentAt, updatedAt: recentAt }] }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.chip:has-text("Todo")');
  const firstRecent = await page
    .waitForFunction(() => document.querySelector('.view--home [aria-label="Escuchado recientemente"] .media-card__title')?.textContent === 'pista sin etiquetas', null, { timeout: 5000 })
    .then(() => true, () => false);
  check(firstRecent, 'lo escuchado en otro equipo sale el primero en "Escuchado recientemente"');

  // Favoritos: el corazón del principio está en metadatos/favoritos.json y los de otro equipo llegan al actualizar.
  const remoteFavorites = async (match) => {
    for (let i = 0; i < 40; i += 1) {
      const body = s3.get('musica', 'metadatos/favoritos.json');
      const favorites = body ? JSON.parse(body.toString()).favorites : [];
      if (match(favorites)) return favorites;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  };
  const favoritesInBucket = await remoteFavorites((favorites) => favorites.filter((record) => !record.deleted).length === 1);
  check(favoritesInBucket !== null, 'los favoritos se guardan en metadatos/favoritos.json del bucket');
  // El Mix diario es aleatorio: el favorito del otro equipo es una canción que aquí aún no lo sea.
  const fromOther = ['s3://musica/Kora/Selva.wav', 's3://musica/Los Prismas/Atardecer.wav'].find((id) => !favoritesInBucket?.some((record) => record.id === id));
  const favoriteAt = Date.now();
  s3.put('musica', 'metadatos/favoritos.json', JSON.stringify({ version: 1, favorites: [...(favoritesInBucket ?? []), { id: fromOther, createdAt: favoriteAt, updatedAt: favoriteAt }] }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.chip:has-text("Favoritos")');
  await page.waitForFunction(() => document.querySelectorAll('.view--home .track-row').length === 2);
  check(
    (await page.getAttribute(`.view--home .track-row[data-path="${fromOther}"] .favorite-button`, 'aria-pressed')) === 'true',
    'un favorito marcado en otro equipo aparece al actualizar',
  );
  check((await page.getAttribute('.view--home .track-row', 'data-path')) === fromOther, 'Inicio › Favoritos muestra primero el más reciente');
  await shot('14-inicio-favoritos');

  s3.setReadOnly(true);
  const denied = path.join(work, 'Para subir', 'Sin permiso.wav');
  await writeFile(denied, createWav({ seconds: 1 }));
  await fakeDialog([denied]);
  await page.click('.nav__item:has-text("Subir canciones")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('no tienen permiso para subir'));
  check((await page.getAttribute('.toast', 'data-tone')) === 'error', 'con claves de solo lectura explica que no hay permiso para subir');
  s3.setReadOnly(false);
  await shot('09-subir-sin-permiso');

  // Fundido de 2 s: la siguiente empieza 2 s antes del final (sin fundido, al acabar la pista).
  await page.selectOption('#crossfade-select', '2');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Fundido de 2 s entre canciones');
  await page.click('.nav__item:has-text("Biblioteca")');
  const firstTitle = await page.textContent('.view--collection .track-row .track-row__title'); // la primera: hay siguiente
  await page.dblclick('.view--collection .track-row >> nth=0');
  // Que empiece de verdad (0:00 y luego avanza): la barra puede enseñar aún el tiempo de la anterior.
  await page.waitForFunction((title) => document.querySelector('.player__title')?.textContent === title && document.querySelector('.player .seek-bar__time')?.textContent === '0:00', firstTitle);
  await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:01');
  const changedAfter = await page.evaluate(async (title) => {
    const range = document.querySelector('.player .seek-bar__range');
    range.value = '6';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));
    const start = performance.now();
    while (document.querySelector('.player__title').textContent === title && performance.now() - start < 8000) await new Promise((resolve) => setTimeout(resolve, 50));
    return performance.now() - start;
  }, firstTitle);
  check(changedAfter < 3500, `con fundido, la siguiente empieza antes del final de la pista (${Math.round(changedAfter)} ms tras saltar a 0:06 de 0:10)`);
  await shot('09b-fundido');
  await page.selectOption('#crossfade-select', '0');

  // Volumen uniforme: "Ola Azul" trae REPLAYGAIN_TRACK_GAIN = -6 dB → suena a la mitad del volumen elegido.
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').set;
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get() { return this.__volume ?? 1; },
      set(value) { this.__volume = value; setter.call(this, value); window.__volumes = [...(window.__volumes ?? []), [this.src, value]]; },
    });
  });
  const volumeOf = (name) => page.evaluate((key) => (window.__volumes ?? []).filter(([src]) => decodeURIComponent(src).includes(key)).at(-1)?.[1], name);
  check((await page.inputValue('#loudness-select')) === 'track', 'volumen uniforme por canción, de serie');
  await page.dblclick('.view--collection .track-row:has-text("Ola Azul")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Ola Azul');
  const uniform = await volumeOf('Ola Azul');
  await page.selectOption('#loudness-select', 'off');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === 'Sin igualar el volumen');
  const full = await volumeOf('Ola Azul');
  check(full > 0 && Math.abs(uniform / full - 0.5) < 0.01, `la pista con ReplayGain -6 dB suena a la mitad (${uniform} de ${full}) y desactivado vuelve al volumen elegido`);
  await page.selectOption('#loudness-select', 'track');
  await page.locator('#loudness-select').scrollIntoViewIfNeeded();
  await shot('09c-volumen-uniforme');

  // Ecualizador: monta Web Audio al dejar de estar plano y la música sigue sonando (media:// con CORS).
  await page.click('.nav__item:has-text("Ecualizador")');
  await page.waitForSelector('#equalizer-dialog[open]');
  check((await page.getAttribute('#equalizer-dialog [data-preset="flat"]', 'aria-pressed')) === 'true', 'el ecualizador empieza plano');
  await page.click('#equalizer-dialog [data-preset="bass"]');
  check((await page.textContent('#equalizer-dialog .eq__band >> nth=0')).includes('+6 dB'), 'el preajuste "Graves" sube los graves');
  await page.locator('#equalizer-dialog .eq__range >> nth=4').fill('5');
  await page.waitForFunction(() => !document.querySelector('#equalizer-dialog .chip--static').hidden);
  check(true, 'mover una banda lo deja en "Personalizado"');
  await shot('09d-ecualizador');
  await page.click('#equalizer-dialog button:has-text("Cerrar")');
  await page.dblclick('.view--collection .track-row:has-text("Atardecer")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Atardecer' && document.querySelector('.player .seek-bar__time')?.textContent >= '0:02', null, { timeout: 8000 }).then(
    () => check(true, 'con el ecualizador, las pistas suenan (el tiempo avanza)'),
    () => check(false, 'con el ecualizador, las pistas suenan (el tiempo avanza)'),
  );
  await page.click('.nav__item:has-text("Ecualizador")');
  await page.click('#equalizer-dialog [data-preset="flat"]');
  await page.click('#equalizer-dialog button:has-text("Cerrar")');

  // Escuchas: lo escuchado (la mitad de una pista de 10 s) cuenta, va a metadatos/escuchas.json y sale en "Más escuchadas".
  let playsInBucket = [];
  for (let i = 0; i < 40 && playsInBucket.length === 0; i += 1) {
    const body = s3.get('musica', 'metadatos/escuchas.json');
    playsInBucket = body ? JSON.parse(body.toString()).plays : [];
    if (playsInBucket.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(playsInBucket.length > 0 && playsInBucket.every((play) => play.count > 0 && play.id.endsWith(play.path)), `lo escuchado se cuenta en metadatos/escuchas.json del bucket (${playsInBucket.length} canciones)`);
  await page.click('.nav__item:has-text("Inicio")');
  await page.click('.chip:has-text("Todo")');
  await page.waitForSelector('.view--home [aria-label="Hechas para ti"] .media-card:has-text("Más escuchadas")');
  check(true, 'Inicio muestra "Hechas para ti" con "Más escuchadas"');
  await page.locator('.view--home [aria-label="Hechas para ti"]').scrollIntoViewIfNeeded();
  await shot('09e-hechas-para-ti');
  await page.click('.view--home [aria-label="Hechas para ti"] .media-card:has-text("Más escuchadas")');
  const mostPlayed = await page.locator('.view--collection .track-row').count();
  check(mostPlayed === playsInBucket.length, `"Más escuchadas" tiene las canciones escuchadas (${mostPlayed})`);
  await page.click('.nav__item:has-text("Biblioteca")');

  // Bandeja y barra de tareas: sus órdenes llegan desde el main; "Seguir en la bandeja" oculta la ventana al cerrar.
  const sendCommand = (command) => app.evaluate(({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('desktop:command', name), command);
  await page.dblclick('.view--collection .track-row >> nth=0');
  const trayBefore = await page.textContent('.player__title');
  await sendCommand('next');
  await page.waitForFunction((title) => document.querySelector('.player__title')?.textContent !== title, trayBefore);
  check(true, 'la bandeja (o la miniatura) pasa a la siguiente');
  await sendCommand('toggle');
  await page.waitForSelector('.player button[aria-label="Reproducir"]');
  check(true, 'la bandeja pausa');
  await page.locator('.switch-row:has-text("Seguir en la bandeja")').scrollIntoViewIfNeeded();
  check(await page.isVisible('.switch-row:has-text("Seguir en la bandeja")'), 'en escritorio se ofrece "Seguir en la bandeja"');
  await page.click('.switch-row:has-text("Seguir en la bandeja") .switch');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('seguirá sonando en la bandeja'));
  await shot('09f-bandeja');
  const hidden = await app.evaluate(async ({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    win.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = { exists: !win.isDestroyed(), visible: win.isVisible() };
    win.show();
    return result;
  });
  check(hidden.exists && !hidden.visible, 'con "Seguir en la bandeja", cerrar oculta la ventana y Pulse sigue abierto');
  await page.click('.switch-row:has-text("Seguir en la bandeja") .switch');

  // Mini-reproductor: Ctrl+M deja la ventana pequeña y siempre encima, con solo la player bar; el botón vuelve.
  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      return { size: win.getContentSize(), onTop: win.isAlwaysOnTop() };
    });
  const normalWindow = await windowState();
  await page.click('.player .seek-bar'); // el foco fuera de los campos de texto
  await page.keyboard.press('Control+M');
  await page.waitForSelector('.app.is-mini');
  await page.waitForFunction(() => window.innerWidth < 500);
  const miniWindow = await windowState();
  check(miniWindow.size[0] === 380 && miniWindow.onTop, `Ctrl+M: mini-reproductor de ${miniWindow.size.join('×')} y siempre encima`);
  check(!(await page.isVisible('.sidebar')) && (await page.isVisible('.player [aria-label="Anterior"]')), 'el mini-reproductor solo enseña la canción y el transporte');
  await shot('09g-mini-reproductor');
  await page.click('.player__mini');
  await page.waitForFunction(() => !document.querySelector('.app.is-mini') && window.innerWidth > 900);
  const restored = await windowState();
  check(restored.size.join('×') === normalWindow.size.join('×') && !restored.onTop, `al volver, la ventana recupera su tamaño (${restored.size.join('×')})`);

  // Papelera: "⋯" › "Eliminar del bucket" (con confirmación), restaurar desde "Papelera" y vaciarla.
  const toastIs = (text) => page.waitForFunction((expected) => document.querySelector('.toast')?.textContent === expected, text);
  const hasRow = (title) => page.locator(`.view--collection .track-row:has-text("${title}")`).count().then((count) => count > 0);
  s3.put('musica', 'Nuevas/Efímera.wav', createWav({ seconds: 3, tags: { title: 'Efímera', artist: 'Kora' } }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await toastIs('1 canción nueva');
  await page.click('.nav__item:has-text("Biblioteca")');
  const trashFromMenu = async () => {
    await page.click('.view--collection .track-row:has-text("Efímera") [data-action="more"]');
    await page.click('.menu__item:has-text("Eliminar del bucket")');
    await page.waitForSelector('.trash-dialog[open] button[type="submit"]:not([hidden])');
  };
  await trashFromMenu();
  await shot('11-eliminar-del-bucket');
  await page.click('.trash-dialog button[type="submit"]');
  await toastIs('Movida a la papelera del bucket');
  check(!(await hasRow('Efímera')) && !s3.get('musica', 'Nuevas/Efímera.wav') && Boolean(s3.get('musica', 'papelera/Nuevas/Efímera.wav')), '"Eliminar del bucket" la mueve a papelera/ y la quita de la biblioteca');
  await page.click('.nav__item:has-text("Papelera")');
  await page.waitForSelector('.trash-dialog[open] .trash-item:has-text("Nuevas/Efímera.wav")');
  await shot('11b-papelera');
  await page.click('.trash-item:has-text("Efímera") .trash-item__restore');
  await toastIs('Restaurada: vuelve a estar en tu biblioteca');
  await page.waitForSelector('.trash-dialog[open] .trash-items:has-text("La papelera está vacía")');
  await page.click('.trash-dialog .link-button:has-text("Cerrar")');
  await page.waitForSelector('.view--collection .track-row:has-text("Efímera")');
  check(Boolean(s3.get('musica', 'Nuevas/Efímera.wav')), 'desde "Papelera" se restaura en su carpeta y vuelve a la biblioteca');
  await trashFromMenu();
  await page.click('.trash-dialog button[type="submit"]');
  await toastIs('Movida a la papelera del bucket');
  await page.click('.nav__item:has-text("Papelera")');
  await page.click('.trash-dialog[open] .link-button:has-text("Vaciar papelera")');
  await page.click('.trash-dialog[open] .link-button:has-text("Pulsa otra vez")');
  await toastIs('1 canción borrada para siempre');
  await page.click('.trash-dialog .link-button:has-text("Cerrar")');
  check(!s3.keys('musica').some((key) => key.includes('Efímera')), 'vaciar la papelera (con doble pulsación) la borra para siempre');

  check(logs.length === 0, `sin errores de consola${logs.length ? `:\n  ${logs.join('\n  ')}` : ''}`);

  // Canción borrada del bucket con la app abierta (aquí el 404 en la consola es lo esperado). Tiene que ser una que
  // no haya sonado: el Mix y la cola pasan por casi todas, y Chromium vuelve a tocar desde su caché lo ya descargado.
  s3.put('musica', 'Nuevas/Fugaz.wav', createWav({ seconds: 3, tags: { title: 'Fugaz', artist: 'Kora' } }));
  await page.click('.nav__item:has-text("Actualizar biblioteca")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '1 canción nueva');
  s3.remove('musica', 'Nuevas/Fugaz.wav');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.dblclick('.view--collection .track-row:has-text("Fugaz")');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('ya no está en el bucket'));
  check(
    (await page.locator('.view--collection .track-row:has-text("Fugaz")').count()) === 0,
    'una canción borrada del bucket se quita al intentar reproducirla',
  );

  // Retomar: al cerrar y volver a abrir, la misma pista, en pausa y en el segundo en que se dejó.
  const elapsed = () => page.textContent('.player .seek-bar__time');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.dblclick('.view--collection .track-row:has-text("Ola Azul")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Ola Azul');
  await page.waitForFunction(() => !['0:00', '0:01'].includes(document.querySelector('.player .seek-bar__time')?.textContent), null, { timeout: 8000 });
  await page.click('.player .play-button');
  await page.waitForSelector('.player .play-button[aria-label="Reproducir"]');
  const leftAt = await elapsed();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  const resumed = await page
    .waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Ola Azul', null, { timeout: 10000 })
    .then(() => true, () => false);
  await page.waitForFunction((at) => document.querySelector('.player .seek-bar__time')?.textContent === at, leftAt, { timeout: 5000 }).catch(() => {});
  const resumedAt = await elapsed();
  const paused = (await page.getAttribute('.player .play-button', 'aria-label')) === 'Reproducir';
  check(resumed && paused && resumedAt === leftAt, `al volver a abrir retoma la pista en pausa donde se dejó (${resumedAt}; se dejó en ${leftAt})`);
  await shot('10-retomar');

  // Carpetas del ordenador en vez del bucket: de solo lectura, con saltos (rangos) y sin subir ni papelera.
  const localErrors = [];
  page.on('pageerror', (error) => localErrors.push(error.message));
  const folder = path.join(work, 'Mi música');
  await mkdir(path.join(folder, 'Disco'), { recursive: true });
  await writeFile(path.join(folder, 'Disco', 'Local.wav'), createWav({ seconds: 10, tags: { title: 'Canción Local', artist: 'Río Claro', album: 'Orilla' } }));
  await fakeDialog([folder]);
  await page.click('.nav__item:has-text("Conexión")');
  await page.click('#connection-tab-local');
  await shot('15-conexion-carpetas-vacia');
  await page.click('#connection-add-folder');
  await page.waitForSelector('.connection__folders .list-picker__item:has-text("Mi música")');
  await shot('15b-conexion-carpetas');
  await page.click('.connection button[type="submit"]');
  await page.waitForSelector('.connection', { state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.nav__status')?.textContent === 'Mi música');
  check((await page.textContent('.nav__status')) === 'Mi música', 'la sidebar muestra la carpeta en uso');
  check(!(await page.isVisible('.nav__item:has-text("Subir canciones")')) && !(await page.isVisible('.nav__item:has-text("Papelera")')), 'con carpetas no se ofrece subir ni la papelera');
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForFunction(() => document.querySelectorAll('.view--collection .track-row').length === 1);
  check((await page.textContent('.view--collection .track-row .track-row__title')) === 'Canción Local', 'la biblioteca es la música de la carpeta, con sus etiquetas');
  await page.dblclick('.view--collection .track-row:has-text("Canción Local")');
  await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Canción Local' && document.querySelector('.player .seek-bar__time')?.textContent >= '0:01', null, { timeout: 10000 });
  await page.evaluate(() => {
    const range = document.querySelector('.player .seek-bar__range');
    range.value = '7';
    range.dispatchEvent(new Event('input'));
    range.dispatchEvent(new Event('change'));
  });
  const seeked = await page.waitForFunction(() => document.querySelector('.player .seek-bar__time')?.textContent >= '0:07', null, { timeout: 5000 }).then(() => true, () => false);
  check(seeked, 'una canción de la carpeta suena y se puede saltar (rangos desde el disco)');
  await page.click('.view--collection .track-row:has-text("Canción Local") [data-action="more"]');
  check((await page.locator('.menu__item:has-text("Eliminar del bucket")').count()) === 0, 'el «⋯» no ofrece eliminar canciones de las carpetas');
  await page.keyboard.press('Escape');
  await shot('16-carpetas-biblioteca');
  check((await readdir(folder)).join() === 'Disco' && (await readdir(path.join(folder, 'Disco'))).join() === 'Local.wav', 'Pulse no escribe nada en la carpeta');

  await page.click('.nav__item:has-text("Conexión")');
  await page.click('#connection-tab-s3');
  await page.click('.connection button[type="submit"]'); // la clave secreta guardada se conserva
  await page.waitForSelector('.connection', { state: 'hidden' });

  await page.waitForFunction(() => document.querySelector('.nav__status')?.textContent.startsWith('musica'));
  await page.click('.nav__item:has-text("Biblioteca")');
  await page.waitForFunction(() => document.querySelectorAll('.view--collection .track-row').length > 1 && !document.querySelector('.view--collection')?.textContent.includes('Canción Local'));
  check(await page.isVisible('.nav__item:has-text("Subir canciones")'), 'al volver al bucket vuelve su música y «Subir canciones»');
  check(localErrors.length === 0, `sin errores de página con carpetas${localErrors.length ? `: ${localErrors.join(' · ')}` : ''}`);
} finally {
  await app.close();
  await s3.close();
  await rm(work, { recursive: true, force: true });
}

console.log(problems.length ? `\n${problems.length} comprobación(es) fallida(s)` : `\nTodo correcto. Capturas en ${OUTPUT}`);
process.exit(problems.length ? 1 : 0);
