---
name: iniciar-proyecto
description: Inicializa (scaffold) "Pulse", el reproductor de música de escritorio nativo para Windows y Linux hecho con JavaScript (Electron) y estructurado con el patrón de diseño Mediator, siguiendo el diseño app-musica-figma.svg. Úsala cuando el usuario pida iniciar, crear, arrancar o montar el proyecto del reproductor, generar su estructura base, o rehacer el esqueleto desde cero.
---

# Iniciar proyecto: reproductor de música con patrón Mediator

Objetivo: dejar en la carpeta actual un proyecto **Electron + JavaScript puro** que arranca con `npm start`,
importa y reproduce música local, se parece al diseño `app-musica-figma.svg` y empaqueta para
**Windows (NSIS)** y **Linux (AppImage + deb)**, con toda la coordinación de la UI en un **Mediator**
que nunca se convierte en un *God Object*.

`templates/` contiene **todo lo que no depende del diseño visual**, ya probado (147 tests): proceso main,
preload, núcleo del patrón, mediator y handlers, modelos y servicios, tokens, `index.html`, scripts y tests.
Lo visual (vistas, `ui/`, `layout.css`, `components.css`) se **genera** a partir del diseño (Paso 4).

## Paso 0 — Comprobaciones

1. `node -v` (**>= 22**: los tests usan globs de `node --test`) y `npm -v`.
2. Lista la carpeta. Si ya existe `package.json` o `src/`, **no sobrescribas**: pregunta si rehacer el
   esqueleto o solo completar lo que falte.
3. Si no es repositorio git: `git init -b main`, `.gitignore` (`node_modules/`, `dist/`, `out/`, `*.log`,
   `.claude/settings.local.json`, `tests/e2e/output/`) y `.gitattributes` (`* text=auto eol=lf` y
   `*.png`/`*.ico`/`*.wav binary`). Si git no tiene identidad, configúrala **solo en el repo**.
4. **Commits pequeños**: uno por pieza verificada (núcleo, cada modelo, cada grupo de handlers, cada vista…),
   en español y estilo Conventional Commits (`feat(core): …`, `fix(ui): …`).

## Paso 1 — package.json y dependencias

Copia `templates/package.json`, añade `"author": "Nombre <email>"` (electron-builder lo exige para el `.deb`) y:

```bash
npm install --save-dev electron electron-builder playwright-core
npm install music-metadata @fontsource/inter
```

- Electron ≥ 45 ya no tiene `postinstall`: descarga el binario en el primer uso. Fuérzalo ya con
  `node node_modules/electron/install.js` para no llevarte sorpresas.
- `music-metadata` (ESM) solo en el proceso main. `@fontsource/inter`: tipografía del diseño sin conexión.
- `playwright-core` solo para el e2e (maneja Electron sin descargar navegadores).
- Nada de frameworks de UI salvo que el usuario lo pida: HTML + ES modules.

## Paso 2 — Estructura

`T` = copiar de `templates/` tal cual · `G` = generar en el Paso 4.

```
src/main/                          T  proceso main (no forma parte del mediator)
  main.js                             ventana 1280×800 (mín. 960×600), instancia única, sin navegación, --lang=es
  protocol/urls.js · responses.js     media://track|cover/<ruta>: rangos HTTP (206/416), 403 fuera de la biblioteca
  protocol/media.js                   registro del esquema en Electron
  library/tracks.js                   escaneo de carpetas + metadatos (concurrencia 8) + carátulas con caché
  library/store.js · importer.js      library.json en userData (escritura atómica) e importación validada
  ipc/library.js                      library:load | choose-files | choose-folder | import
src/preload/preload.cjs            T  window.api (contextBridge, sandbox, webUtils.getPathForFile)
src/assets/icon.png                T* lo genera `npm run icons` (scripts/generate-icon.mjs)
src/renderer/
  index.html · app.js              T  esqueleto con CSP · raíz de composición (colegas → mediator → app-ready)
  core/Mediator.js · Colleague.js  T
  mediator/                        T  PlayerMediator (solo compone), events.js, actions.js, handlers/
    handlers/playback · output · navigation · modes · library · views · favorites · recents · errors
  colleagues/                         modelos y servicios (T) + vistas (G)
    Catalog · Playlist · Favorites · Recents          T  modelos puros
    AudioEngine · LibraryService · MediaSessionBridge T  servicios
    KeyboardShortcuts                                 T
    Router · HomeView · PlaylistView · SearchView     G  vistas del diseño
    NowPlayingView · ControlsView · ToastView         G
  lib/storage.js · text.js         T  localStorage seguro · normalizar/ordenar texto en español
  ui/                              G  dom · icons · cover · format · trackList · transport
  styles/tokens.css                T  único sitio con valores del diseño
  styles/layout.css · components.css G
scripts/                           T  generate-icon.mjs + lib/png.js (codificador PNG sin dependencias)
tests/                             T  core, handlers, modelos, servicios, main, reglas + helpers/
  ui/format.test.js · cover.test.js G  tests de lo generado en ui/
  e2e/smoke.mjs                    G  prueba de la app real (Paso 5)
```

## Paso 3 — Reglas del patrón Mediator (obligatorias)

1. **Los colegas nunca se conocen entre sí.** Solo importan `core/Colleague.js`, `mediator/events.js`,
   `ui/` y `lib/`. Reciben el mediator con `setMediator()` (lo llama `PlayerMediator`).
2. **Un colega solo hace dos cosas**: exponer métodos propios y avisar con `this.notify(EVENTS.X, payload)`.
3. **Toda coordinación vive en `mediator/handlers/`** (p. ej. "cuando termina la pista, pide la siguiente
   a Playlist, cárgala en AudioEngine y actualiza las vistas" está en `handlers/navigation.js`).
4. Eventos en `kebab-case`, solo los de `mediator/events.js` (cada uno con su payload documentado).
5. Fuentes de verdad: `Catalog` (biblioteca), `Playlist` (cola, aleatorio, repetir), `AudioEngine`
   (tiempo, volumen, salida). Las vistas solo guardan estado de UI (filtro de chips, letra desplegada…).
6. El proceso main **no** es un colega: solo `LibraryService` lo usa, vía `window.api`.
7. Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`, la CSP de `index.html`
   (`default-src 'self'; img-src 'self' data: media:; media-src media:; connect-src media:; style-src 'self';
   font-src 'self'; script-src 'self'`), y nunca `innerHTML` con datos de archivos (usar `h()` de `ui/dom.js`).

`tests/mediator/rules.test.js` comprueba automáticamente las reglas 1, 4 y las del Paso 3b.

## Paso 3b — Evitar que el mediator sea un "God Object" (obligatorio)

1. **`Mediator` (core) solo enruta**: mapa `evento → handlers[]` con `on()`, `use(módulo)` y `notify()`.
   `notify()` **inicia los handlers en orden, no espera a uno para empezar el siguiente** (uno lento, como un
   IPC, no bloquea a los demás), espera a que terminen todos y aísla sus errores (`console.error`).
2. **`PlayerMediator` solo compone**: colegas + contexto congelado + `.use(módulo)`. Ni `if` ni `switch`.
3. **Un módulo de handlers por caso de uso** (`{ [EVENTS.X](ctx, payload, sender) {…} }`), **≤ 80 líneas**,
   sin estado de módulo y sin importar colegas (solo `../events.js` y `../actions.js`).
4. **Funcionalidad nueva = módulo nuevo** registrado con `.use()`. Varios módulos pueden escuchar el mismo
   evento (p. ej. `app-ready` lo escuchan library, playback, output y modes).
5. Los handlers solo coordinan **dos o más colegas**; lo de un único colega va dentro de él.
6. Coordinación repetida → `mediator/actions.js` (`loadTrack`, `resolveCollection`, `playCollection`,
   `openCollection`, `renderCollection`, `refreshHome`, `showModes`, `trackListState`, `eachTrackListView`).
7. **No es un event bus**: nadie se suscribe a nadie; solo `notify()` hacia el mediator.
8. Cada módulo de handlers se testea con `fakeContext()` (modelos reales, servicios y vistas espía).

Eventos y dónde se manejan:

| Emisor | Evento | Módulo | Reacción |
|---|---|---|---|
| `app.js` | `app-ready` | library · playback · output · modes | carga la biblioteca, muestra volumen, salida y modos |
| Controls · NowPlaying · MediaSession · teclado | `play-toggle` | playback | alterna; sin pista, la actual de la cola; sin cola, la biblioteca |
| Controls · NowPlaying · teclado | `seek`, `seek-step`, `volume-change`, `volume-step`, `toggle-mute` | playback | delega en AudioEngine y refleja el volumen |
| AudioEngine | `time-update`, `state-change` | playback | sincroniza player bar, Reproduciendo, listas y sistema |
| NowPlaying | `show-output-devices`, `output-device-change` | output | lista y elige salida ("Altavoz de la sala") |
| Controls · NowPlaying · teclado | `next`, `previous` | navigation | mueve la cola; anterior reinicia si van > 3 s |
| listas (Playlist, Buscar, Inicio) | `track-selected` `{source, path}` | navigation | la colección pasa a ser la cola y suena esa pista |
| PlaylistView | `play-collection` `source` | navigation | reproduce la colección desde el principio |
| AudioEngine | `ended` | navigation | `playlist.nextOnEnded()` |
| Controls · NowPlaying · Playlist · teclado | `toggle-shuffle`, `cycle-repeat` | modes | cambia el modo y lo refleja |
| HomeView (Mix diario) | `play-mix` | modes | biblioteca entera en aleatorio |
| Router · HomeView | `open-files`, `open-folder`, `files-dropped` | library | importa, avisa y repinta |
| Router · teclado | `navigate` | views | inicio/buscar/biblioteca (biblioteca = colección) |
| PlaylistView | `navigate-back` | views | vuelve a la vista anterior |
| HomeView · NowPlaying (cola) | `open-collection` `source` | views | pinta y muestra la colección |
| Controls (portada) · NowPlaying (chevron) · teclado (Esc) | `open-now-playing`, `close-now-playing` | views | overlay Reproduciendo |
| SearchView | `search` | views | resultados del Catalog |
| corazones · teclado (L) | `toggle-favorite` `path?` | favorites | marca y actualiza todos los corazones |
| AudioEngine | `track-started` | recents | añade a recientes y refresca Inicio |
| AudioEngine | `error` | errors | avisa y salta; se detiene si falla toda la cola |

Colecciones (`source.kind`): `library`, `album`, `artist`, `genre`, `search` (las resuelve `Catalog`) y
`queue`, `favorites`, `recents`, `mix` (las resuelve `actions.resolveCollection` combinando modelos).

### Contrato de las vistas generadas (lo que llaman los handlers)

Los modelos y servicios ya vienen en `templates/`. Las vistas que generes **deben** exponer:

- **Router**: `show(view, nav = view)` (`'home'|'search'|'collection'`), `back()`, `openOverlay()`,
  `closeOverlay()`. Emite `navigate`, `open-folder`, `open-files`, `files-dropped`.
- **HomeView**: `render({ isEmpty, recents, genres, albums, artists, favoriteTracks, favorites, currentPath, playing })`,
  `highlight(path)`, `setPlaying(bool)`, `setFavorite(path, bool)`.
- **PlaylistView**: `render(collection, state)`, `source()`, `highlight`, `setPlaying`, `setFavorite`, `setModes({ shuffle })`.
- **SearchView**: `focus()`, `showResults(query, tracks, state)`, `highlight`, `setPlaying`, `setFavorite`.
- **NowPlayingView**: `show(track, isFavorite)`, `setContext(title)`, `setProgress(c, d)`, `setPlaying`,
  `setModes({ shuffle, repeat })`, `setFavorite`, `showOutputDevices(devices, currentId)`, `setOutputDevice(device|null)`.
- **ControlsView**: `show(track, isFavorite)`, `setPlaying`, `setProgress`, `setModes`, `setVolume(v, muted)`, `setFavorite`.
- **ToastView**: `show(message, { tone: 'info'|'error', sticky })`.

`state` = `{ favorites: Set, currentPath, playing }`. `Track = { path, url, cover, title, artist, albumArtist,
album, genre, trackNo, disc, year, duration, lyrics }` (lo construye `src/main/library/tracks.js`).

## Paso 4 — UI según el diseño `app-musica-figma.svg`

1. **Lee `app-musica-figma.svg` y `reference/diseno.md`** antes de escribir la UI: el diseño es móvil y
   `diseno.md` define la adaptación a escritorio y qué significa cada elemento en un reproductor local.
2. **Solo tokens** de `styles/tokens.css` para colores, radios y tamaños de fuente (lo comprueba
   `tests/ui/styles.test.js`). Si falta un valor del diseño, añádelo como token.
3. `ui/` (componentes sin estado de negocio, no son colegas):
   - `dom.js`: `h(tag, props, ...hijos)` sin `innerHTML`, `iconButton`, `setIcon`, `favoriteButton`.
   - `icons.js`: trazados copiados del SVG (viewBox centrado en 0,0) + los que falten con el mismo trazo.
   - `cover.js`: portada real o generada (4 gradientes × 4 formas del diseño, elegidas por hash del álbum);
     dentro de un `<button>` usa `tag: 'span'`.
   - `format.js`: `formatTime`, `formatDuration`, `plural`, `collectionStats`, `greeting`, `formatDeviceLabel`.
   - `trackList.js`: filas de 60 px (doble clic/Enter/botón sobre la portada reproducen; ecualizador animado
     en la activa). `transport.js`: transporte, barra de progreso que no salta al arrastrar, volumen.
4. Pantallas: **Inicio**, **Reproduciendo** (overlay con `inert` detrás y foco devuelto al cerrar),
   **Playlist** (cualquier colección) y **Buscar**, con los estados del diseño: pista activa en
   `--color-accent` con ecualizador, corazón relleno, aleatorio/repetir en `--color-primary` con punto,
   chip activo con `--grad-accent`, salida no predeterminada en `--color-success`.
5. Lo que no existe en local (Podcasts, Radio, Perfil, Compartir) **no se renderiza**.

## Paso 5 — Tests y verificación

1. `npm test` (los de `templates/` + `tests/ui/format.test.js` y `cover.test.js` de lo generado) hasta que pase.
2. **e2e con la app real** (`npm run test:e2e`, `tests/e2e/smoke.mjs`):
   - genera WAV con etiquetas ID3, carátulas y letra con `tests/helpers/audio.js` (no versiones música);
   - arranca Electron con `--user-data-dir` temporal y pon `localStorage['pulse.muted'] = 'true'` antes de
     recargar (que no suene en los altavoces del usuario);
   - importa con `window.api.importPaths([...])` y recarga; recorre Inicio, Biblioteca, Reproduciendo,
     Buscar y Álbumes; comprueba que el tiempo avanza, que saltar funciona, favoritos, letra, salidas,
     Espacio con el foco en un botón y **cero errores de consola**;
   - capturas con `animations: 'disabled'` en `tests/e2e/output/` y **compáralas con el diseño**.
3. **No** ejecutes `npm run dist` salvo que lo pidan (lento). `dist:win` → NSIS; `dist:linux` → AppImage + deb
   (mejor desde Linux, WSL o CI).

## Paso 6 — Cierre

- `CLAUDE.md` breve: comandos, estructura, reglas de los Pasos 3 y 3b, cómo añadir una funcionalidad y
  convenciones (español, commits pequeños, tokens), para que futuras sesiones no engorden el mediator.
- Resume al usuario qué se creó y cómo añadir una funcionalidad: 1) colega nuevo si hace falta (en `app.js`);
  2) sus eventos en `events.js`; 3) un **módulo nuevo** en `handlers/` con su test y una línea `.use(...)`.

## Problemas reales ya resueltos (no los repitas)

- `node --test tests/` con un directorio falla en Node 24 → usar el glob `"tests/**/*.test.js"`.
- `net.fetch(file://)` no garantiza peticiones de rango → `responses.js` sirve el archivo con 206/416 propios.
- Un `notify()` que esperaba a cada handler bloqueaba `app-ready` si listar dispositivos tardaba → concurrente.
- La Media Session API rechaza carátulas `media://` → `MediaSessionBridge` las convierte en `blob:`
  (y la CSP necesita `connect-src media:`).
- Chromium deja "Default - …" en inglés y añade ids USB; existe una salida virtual "communications" →
  `formatDeviceLabel()` y filtrarla en `AudioEngine.outputDevices()`.
- Con la ventana de prueba tapada, Windows no pinta frames y las transiciones quedan a medias en las
  capturas → `animations: 'disabled'`. `ERR_ABORTED` en `media://track` al saltar o cambiar de pista es normal.
- Con el foco en un botón, Espacio debe pausar y no pulsar el botón: `KeyboardShortcuts` lo previene.
