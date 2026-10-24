---
name: iniciar-proyecto
description: Inicializa (scaffold) "Pulse", el reproductor de música de escritorio nativo para Windows y Linux hecho con JavaScript (Electron) y estructurado con el patrón de diseño Mediator, siguiendo el diseño app-musica-figma.svg. Úsala cuando el usuario pida iniciar, crear, arrancar o montar el proyecto del reproductor, generar su estructura base, o rehacer el esqueleto desde cero.
---

# Iniciar proyecto: reproductor de música con patrón Mediator

Objetivo: dejar en la carpeta actual un proyecto **Electron + JavaScript puro** que arranca con `npm start`,
reproduce la música de un **bucket S3** (o compatible, como MinIO), se parece al diseño `app-musica-figma.svg` y empaqueta para
**Windows (NSIS)** y **Linux (AppImage + deb)**, con toda la coordinación de la UI en un **Mediator**
que nunca se convierte en un *God Object*.

`templates/` contiene **todo lo que no depende del diseño visual**, ya probado (310 tests): proceso main
(**S3**: conexión cifrada, sincronización, audio con rangos, subir canciones y metadatos/ en el bucket; **datos de internet**: carátula, álbum, año, género, pista y letra), preload, núcleo del patrón,
mediator y handlers, modelos y servicios, tokens, `index.html`, scripts y tests.
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
npm install music-metadata @fontsource/inter @aws-sdk/client-s3
```

- Electron ≥ 45 ya no tiene `postinstall`: descarga el binario en el primer uso. Fuérzalo ya con
  `node node_modules/electron/install.js` para no llevarte sorpresas.
- `music-metadata` (ESM) y `@aws-sdk/client-s3` solo en el proceso main. `@fontsource/inter`: tipografía del diseño sin conexión.
- `playwright-core` solo para el e2e (maneja Electron sin descargar navegadores).
- Nada de frameworks de UI salvo que el usuario lo pida: HTML + ES modules.

## Paso 2 — Estructura

`T` = copiar de `templates/` tal cual · `G` = generar en el Paso 4.

```
src/main/                          T  proceso main (no forma parte del mediator)
  main.js                             ventana 1280×800 (mín. 960×600), instancia única, sin navegación, --lang=es
  s3/storage.js                       SDK de S3 (path-style): listar audio, rangos, stat/exists, upload (nunca borra),
                                      errores en español
  s3/connection.js · service.js       conexión en userData/s3.json con la clave secreta cifrada (safeStorage),
                                      importar credentials.json (MinIO o AWS), probar y conectar
  protocol/urls.js · responses.js     media://track|cover/<id>: audio de S3 con rangos (206/416), 403 fuera de la biblioteca
  protocol/media.js                   registro del esquema en Electron
  library/remote.js                   id "s3://bucket/clave"; etiquetas leyendo los primeros 512 KB del objeto
  library/sync.js                     biblioteca = bucket: añade, relee (ETag) y quita; verify(id)
  library/upload.js                   subir archivos y carpetas del ordenador (sin sobrescribir) y sincronizar
  library/metadata.js                 copia de la biblioteca en metadatos/biblioteca.json + metadatos/caratulas/
  library/tracks.js · store.js        registro ↔ Track · library.json en userData (caché local, escritura atómica, onSave)
  online/matching.js                  ¿es la misma canción? (título, artista, duración, otras versiones)
  online/itunes.js · deezer.js        iTunes Search y, si no la tiene, Deezer (datos + carátula), sin clave
  online/lrclib.js                    LRCLIB (letra), sin clave
  online/http.js                      net.fetch con User-Agent, tiempo máximo y TransientError
  online/enricher.js · queue.js       completar sin pisar etiquetas + cola en segundo plano (~17/min)
  ipc/library.js                      library:load | sync | verify | choose-uploads | upload · connection:get | save | import
  ipc/metadata.js                     metadata:lookup | set-enabled (+ aviso library:tracks-updated)
src/preload/preload.cjs            T  window.api (contextBridge, sandbox, webUtils.getPathForFile)
src/assets/icon.png                T* lo genera `npm run icons` (scripts/generate-icon.mjs)
src/renderer/
  index.html · app.js              T  esqueleto con CSP · raíz de composición (colegas → mediator → app-ready)
  core/Mediator.js · Colleague.js  T
  mediator/                        T  PlayerMediator (solo compone), events.js, actions.js, handlers/
    handlers/playback · output · navigation · modes · library · changes · connection · uploads ·
             views · favorites · recents · online · errors
  colleagues/                         modelos y servicios (T) + vistas (G)
    Catalog · Playlist · Favorites · Recents · Settings T  modelos puros
    AudioEngine · LibraryService · MediaSessionBridge T  servicios
    KeyboardShortcuts                                 T
    Router · HomeView · PlaylistView · SearchView     G  vistas del diseño
    NowPlayingView · ControlsView · ToastView         G
    ConnectionView                                    G  formulario de conexión (<dialog id="connection">)
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
   (tiempo, volumen, salida), `Settings` (preferencias). Las vistas solo guardan estado de UI (filtro de
   chips, letra desplegada…).
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
   evento (p. ej. `app-ready` lo escuchan library, connection, playback, output, modes y online; `track-started`,
   recents y online). Así se añadieron los datos de internet: `handlers/online.js` + una línea `.use(online)`.
5. Los handlers solo coordinan **dos o más colegas**; lo de un único colega va dentro de él.
6. Coordinación repetida → `mediator/actions.js` (`loadTrack`, `showTrack`, `clearPlayer`, `playCurrentOrClear`,
   `removeTracks`, `applyTrackUpdates`, `resolveCollection`, `playCollection`, `openCollection`, `renderCollection`,
   `refreshLibraryViews`, `refreshHome`, `showModes`, `trackListState`, `eachTrackListView`).
7. **No es un event bus**: nadie se suscribe a nadie; solo `notify()` hacia el mediator.
8. Cada módulo de handlers se testea con `fakeContext()` (modelos reales, servicios y vistas espía).

Eventos y dónde se manejan:

| Emisor | Evento | Módulo | Reacción |
|---|---|---|---|
| `app.js` | `app-ready` | library · connection · playback · output · modes · online | carga la biblioteca, muestra la conexión (sin ella abre el formulario), volumen, salida, modos y la preferencia de internet |
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
| Router · HomeView | `sync-library` | library | sincroniza con el bucket y avisa ("ya está al día" / error) |
| LibraryService | `library-changed` `{removed, added}` | changes | añade/quita pistas, sigue la cola si sonaba una borrada y avisa |
| Router · HomeView | `upload-songs` | uploads | diálogo del main, sube y resume ("2 canciones subidas · 1 ya estaba…"); sin conexión abre el formulario |
| Router (soltar en la ventana) | `files-dropped` `File[]` | uploads | igual, con lo arrastrado |
| LibraryService | `upload-progress` `{current, total, name}` | uploads | aviso fijo "Subiendo 2 de 5: «…»" |
| Router · HomeView | `open-connection` | connection | abre el formulario con la conexión guardada (sin secreto) |
| ConnectionView | `save-connection`, `import-credentials` | connection | conecta (o muestra el error en el formulario), toast "Conectado a «bucket»" y sincroniza |
| Router · teclado | `navigate` | views | inicio/buscar/biblioteca (biblioteca = colección) |
| PlaylistView | `navigate-back` | views | vuelve a la vista anterior |
| HomeView · NowPlaying (cola) | `open-collection` `source` | views | pinta y muestra la colección |
| Controls (portada) · NowPlaying (chevron) · teclado (Esc) | `open-now-playing`, `close-now-playing` | views | overlay Reproduciendo |
| SearchView | `search` | views | resultados del Catalog |
| corazones · teclado (L) | `toggle-favorite` `path?` | favorites | marca y actualiza todos los corazones |
| AudioEngine | `track-started` | recents · online | añade a recientes y refresca Inicio · completa la pista con internet (letra incluida) |
| Router (interruptor) | `set-online-lookup` `bool` | online | guarda la preferencia y activa/desactiva la cola del main |
| NowPlaying ("Buscar en internet") | `lookup-track` `path` | online | búsqueda forzada con estado de carga y aviso |
| LibraryService | `tracks-updated` `Track[]` | online | reparte el lote completado en segundo plano |
| AudioEngine | `error` | errors | comprueba en el bucket si sigue ahí (si no, la quita), avisa y salta; se detiene si falla toda la cola |

Colecciones (`source.kind`): `library`, `album`, `artist`, `genre`, `search` (las resuelve `Catalog`) y
`queue`, `favorites`, `recents`, `mix` (las resuelve `actions.resolveCollection` combinando modelos).

### Contrato de las vistas generadas (lo que llaman los handlers)

Los modelos y servicios ya vienen en `templates/`. Las vistas que generes **deben** exponer:

- **Router**: `show(view, nav = view)` (`'home'|'search'|'collection'`), `back()`, `openOverlay()`,
  `closeOverlay()`, `isOverlayOpen()`, `setOnlineLookup(bool)`, `setConnection(summary|null)` ("Conexión S3" con
  "bucket · host" o "Sin conectar"). Emite `navigate`, `open-connection`, `upload-songs` ("Subir canciones"),
  `files-dropped` (soltar archivos o carpetas en la ventana, con la clase `.app.is-dropping` mientras se arrastra),
  `sync-library` ("Actualizar biblioteca") y `set-online-lookup` (interruptor "Datos de internet" en la sidebar).
- **HomeView**: `render({ isEmpty, recents, genres, albums, artists, favoriteTracks, favorites, currentPath, playing })`,
  `highlight(path)`, `setPlaying(bool)`, `setFavorite(path, bool)`, `updateTrack(track, isFavorite)`, `removeTracks(paths)`.
  Sin biblioteca: "Conectar mi bucket" (`open-connection`), "Subir canciones" (`upload-songs`) y
  "Actualizar biblioteca" (`sync-library`).
- **PlaylistView**: `render(collection, state)`, `source()`, `highlight`, `setPlaying`, `setFavorite`, `updateTrack`,
  `removeTracks`, `setModes({ shuffle })`.
- **SearchView**: `focus()`, `showResults(query, tracks, state)`, `highlight`, `setPlaying`, `setFavorite`, `updateTrack`, `removeTracks`.
- **NowPlayingView**: `show(track, isFavorite)` (con la misma pista no pliega la letra), `setContext(title)`,
  `setProgress(c, d)`, `setPlaying`, `setModes({ shuffle, repeat })`, `setFavorite`, `showOutputDevices(devices, currentId)`,
  `setOutputDevice(device|null)`, `setLookupState('loading'|'idle')`. Tarjeta "Información" (filas de
  `trackDetails()`) con "Buscar en internet", que emite `lookup-track`.
- **ControlsView**: `show(track, isFavorite)`, `clear()`, `setPlaying`, `setProgress`, `setModes`, `setVolume(v, muted)`, `setFavorite`.
- **ConnectionView** (`<dialog>`): `open(summary|null)`, `fill(fields)`, `showError(message)`, `setBusy(bool)`, `close()`.
  Campos servidor, clave de acceso, clave secreta (nunca se rellena: vacía = conservar la guardada), bucket
  (opcional si solo hay uno) y carpeta; botón "Importar credentials.json". Borra la clave secreta al cerrarse.
  Emite `save-connection` `{ endpoint, accessKeyId, secretAccessKey, bucket, prefix }` e `import-credentials`.
- **ToastView**: `show(message, { tone: 'info'|'error', sticky })`.

`state` = `{ favorites: Set, currentPath, playing }`. `Track = { path, url, cover, title, artist, albumArtist,
album, genre, trackNo, trackCount, disc, year, duration, lyrics, online }` (lo construye `src/main/library/tracks.js`; `path` es el id `s3://bucket/clave`;
`online = { status: 'found'|'not-found'|'error', source, checkedAt, lyricsSource, lyricsCheckedAt } | null`).

### Música en S3 (ya en `templates/`)

- **Las claves nunca van en el repo ni en el instalador.** Se introducen en la app (o se importa un
  `credentials.json`) y se guardan en `userData/s3.json` con la clave secreta cifrada con `safeStorage`
  (DPAPI en Windows, llavero en Linux). La clave secreta nunca vuelve al renderer.
- Si el usuario te da credenciales reales, **no las imprimas ni las copies a ningún archivo del proyecto**:
  úsalas solo en scripts de prueba fuera del repo (scratchpad).
- Sincronización (`sync.js`): al arrancar, al volver a la ventana (como mucho cada 15 s) y con "Actualizar
  biblioteca". Lo que falla al descargarse no se guarda a medias: se reintenta en la siguiente.
- Si una pista falla al sonar, `library:verify` mira si sigue en el bucket; si no, se quita de todo.
- **Metadatos en el bucket** (`metadata.js`): `metadatos/biblioteca.json` y `metadatos/caratulas/` bajo la carpeta de
  la conexión. Las carátulas de internet se guardan **por nombre** (`coverName`), no por ruta del equipo. Subida a
  los 5 s de cada guardado (máx. 60 s), al arrancar y antes de cerrar; reintento al minuto. `sync` lo lee antes
  de leer archivos (mismo ETag → no se relee; búsqueda más reciente → `onUpdated`). library.json es solo caché.
- Subir (`upload.js`): de una en una bajo la carpeta de la conexión; una carpeta arrastrada conserva su nombre en la
  clave. **Nunca sobrescribe**: mismo nombre y tamaño → se salta; otro archivo con ese nombre → "Nombre (2).mp3".
  Después sincroniza, y las canciones llegan como cualquier otra novedad del bucket.

### Datos de internet (ya en `templates/`)

- iTunes Search API (catálogo `ES`, géneros en español, carátula 600×600), Deezer como segunda fuente (sin género,
  año ni pista) y LRCLIB (letra): gratuitas y sin clave,
  siempre desde el proceso main con `net.fetch` (respeta el proxy del sistema). El renderer nunca sale a internet.
- **Rellenar huecos, nunca pisar etiquetas.** Título y artista solo se toman de internet si el título venía del nombre
  del archivo, probando "Artista - Título" y "Título - Artista" (`queriesFromRecord` + `pickBestOf`; las dos lecturas
  tienen las mismas palabras, así que basta una búsqueda por servicio). `matching.js` exige título ≥ 0,8, artista ≥ 0,6 y ≤ 20 s de diferencia; sin artista, título casi
  idéntico y ≤ 3 s; descarta otras versiones (remix, directo, idiomas…). Más vale no encontrar que equivocarse.
- La pista que empieza a sonar se completa al momento (con letra); el resto en segundo plano, una cada 3,5 s,
  empezando 10 s después de arrancar. Lo no encontrado se marca y no se repite (salvo una vez si sube
  `LOOKUP_VERSION`); sin red, se reintenta al minuto.
- Persistencia: `library.json` + carátulas en `userData/covers/` (una por álbum). Funciona sin conexión.
- **Privacidad**: envía título y artista a esos servicios → interruptor "Datos de internet" (`Settings`,
  activado por defecto) y botón "Buscar en internet" para forzar una pista.

## Paso 4 — UI según el diseño `app-musica-figma.svg`

1. **Lee `app-musica-figma.svg` y `reference/diseno.md`** antes de escribir la UI: el diseño es móvil y
   `diseno.md` define la adaptación a escritorio y qué significa cada elemento en este reproductor.
2. **Solo tokens** de `styles/tokens.css` para colores, radios y tamaños de fuente (lo comprueba
   `tests/ui/styles.test.js`). Si falta un valor del diseño, añádelo como token.
3. `ui/` (componentes sin estado de negocio, no son colegas):
   - `dom.js`: `h(tag, props, ...hijos)` sin `innerHTML`, `iconButton`, `setIcon`, `favoriteButton`.
   - `icons.js`: trazados copiados del SVG (viewBox centrado en 0,0) + los que falten con el mismo trazo.
   - `cover.js`: portada real o generada (4 gradientes × 4 formas del diseño, elegidas por hash del álbum);
     dentro de un `<button>` usa `tag: 'span'`.
   - `format.js`: `formatTime`, `formatDuration`, `plural`, `collectionStats`, `greeting`, `formatDeviceLabel`,
     `formatTrackNumber` ("9 de 15"), `formatDataSource` y `trackDetails` (filas de la tarjeta "Información").
   - `trackList.js`: filas de 60 px (doble clic/Enter/botón sobre la portada reproducen; ecualizador animado
     en la activa; `updateTrack()` repinta solo una fila). `transport.js`: transporte, barra de progreso que no
     salta al arrastrar, volumen.
4. Pantallas: **Inicio**, **Reproduciendo** (overlay con `inert` detrás y foco devuelto al cerrar),
   **Playlist** (cualquier colección) y **Buscar**, con los estados del diseño: pista activa en
   `--color-accent` con ecualizador, corazón relleno, aleatorio/repetir en `--color-primary` con punto,
   chip activo con `--grad-accent`, salida no predeterminada en `--color-success`.
5. Lo que no existe en la app (Podcasts, Radio, Perfil, Compartir) **no se renderiza**.

## Paso 5 — Tests y verificación

1. `npm test` (los de `templates/` + `tests/ui/format.test.js` y `cover.test.js` de lo generado) hasta que pase.
2. **e2e con la app real** (`npm run test:e2e`, `tests/e2e/smoke.mjs`):
   - **nunca contra el S3 real**: levanta `tests/helpers/fakeS3.js` con WAV de 10 s (caben en los 512 KB que se leen)
     con etiquetas ID3, carátulas y letra generados con `tests/helpers/audio.js` (no versiones música);
   - arranca Electron con `--user-data-dir` temporal y, **antes de conectar**, pon
     `localStorage['pulse.muted'] = 'true'` (que no suene en los altavoces del usuario) y
     `localStorage['pulse.onlineLookup'] = 'false'` (la prueba nunca llama a iTunes, Deezer ni LRCLIB) y recarga;
   - conecta desde el formulario (primero con una clave incorrecta: debe explicar el error); recorre Inicio,
     Biblioteca, Reproduciendo, Buscar y Álbumes; sube una canción al S3 falso y pulsa "Actualizar biblioteca";
     sube otra con "Subir canciones" sustituyendo el diálogo del main (`app.evaluate(({ dialog }) => …)`), repítela
     (no se duplica) y prueba con el S3 falso en solo lectura (mensaje de permiso);
     borra otra y comprueba que al reproducirla se quita; comprueba que el tiempo avanza, que saltar funciona, favoritos, letra, salidas,
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
- `<audio>` necesita rangos para saltar → `responses.js` pide a S3 el rango (`GetObject` con `Range`) y responde 206/416.
- Un `notify()` que esperaba a cada handler bloqueaba `app-ready` si listar dispositivos tardaba → concurrente.
- La Media Session API rechaza carátulas `media://` → `MediaSessionBridge` las convierte en `blob:`
  (y la CSP necesita `connect-src media:`).
- Chromium deja "Default - …" en inglés y añade ids USB; existe una salida virtual "communications" →
  `formatDeviceLabel()` y filtrarla en `AudioEngine.outputDevices()`.
- Con la ventana de prueba tapada, Windows no pinta frames y las transiciones quedan a medias en las
  capturas → `animations: 'disabled'`. `ERR_ABORTED` en `media://track` al saltar o cambiar de pista es normal.
- Con el foco en un botón, Espacio debe pausar y no pulsar el botón: `KeyboardShortcuts` lo previene
  (pero en interruptores y casillas Espacio debe marcarlos).
- iTunes devolvía "Despacito (Mandarin Version) [feat. JJ Lin]" empatada con la original porque `simplify()`
  ignora los paréntesis → `isOtherVersion()` descarta marcas de otra versión ("Remastered" no cuenta).
- "Tussi - Arcángel.mp3" es "Título - Artista" y iTunes no tiene la canción: se buscaba la canción "Arcángel" de
  "Tussi" y la letra con el nombre entero → dos lecturas del nombre, Deezer de respaldo y letra con lo encontrado.
- LRCLIB responde 503 a ratos y eso tiraba también los datos ya encontrados → la letra falla sola y queda pendiente.
- LRCLIB con "Luis Fonsi & Daddy Yankee" devuelve letras con "^" en vez de saltos de línea → buscar con
  `primaryArtist()` y convertir "^" en salto de línea.
- Con la tarjeta Información, la portada de Reproduciendo (centrada en vertical) quedaba baja y cortada →
  alineada arriba y `position: sticky` en dos columnas.
- Un fallo de red al leer las etiquetas se tomaba como "sin etiquetas" y guardaba la pista a medias (duración 0)
  → `readRemoteRecord` propaga los errores de descarga y `sync` salta ese objeto hasta la próxima.
- El SDK de S3 calcula por defecto sumas CRC32 y envía el cuerpo "aws-chunked", que algunos servicios compatibles
  no entienden → `requestChecksumCalculation: 'WHEN_REQUIRED'` (el S3 falso rechaza "aws-chunked" para detectarlo).
- Con un logger propio el SDK escribe en consola cada error (y "non-retryable streaming request" al fallar una
  subida con stream), aunque ya llegan a quien llama → logger silencioso salvo otros avisos.
- Con el MinIO real una subida de metadatos recibió un 403 pasajero y no se reintentaba → reintento al minuto y
  el aviso incluye el código del servidor (antes todo 403 parecía "sin permiso").
- Prueba contra un S3/MinIO real: script aparte en el scratchpad (no en el repo) que lee las credenciales del
  archivo que indique el usuario sin imprimirlas.
- Prueba de los datos de internet en vivo: un script aparte (no en el repo) con WAV sin etiquetas llamados
  "Artista - Título" y con la **duración real** de la canción (si no, la coincidencia los rechaza, como debe).
