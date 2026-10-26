# Pulse — reproductor de música (Electron + patrón Mediator)

Reproductor nativo para **Windows, Linux (Electron) y Android (Capacitor, APK)** en JavaScript puro (sin frameworks de UI). **La música viene de un bucket S3**
(o compatible, como MinIO); las canciones del ordenador se suben al bucket. Diseño de referencia:
`app-musica-figma.svg` (móvil) y su adaptación a escritorio en `.claude/skills/iniciar-proyecto/reference/diseno.md`.
La skill `iniciar-proyecto` es la fuente de las reglas de abajo: tenla presente antes de tocar código.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca la app en desarrollo |
| `npm test` | Tests unitarios (`node:test`, Node ≥ 22) |
| `npm run test:e2e` | Prueba de humo de la app real (playwright-core) contra un **S3 falso** (`tests/helpers/fakeS3.js`): abre la ventana unos segundos, audio silenciado, capturas en `tests/e2e/output/` |
| `npm run icons` | Regenera `src/assets/icon.png` y los iconos de Android (`mipmap-*`: clásico, redondo y adaptativo) |
| `npm run dist:win` / `npm run dist:linux` | Instaladores en `dist/` (NSIS / AppImage + deb). Lento: solo cuando se pida. El `.deb`/AppImage, mejor desde Linux, WSL o CI |
| `npm run android:apk` | `www/` → `cap sync` → Gradle → `dist/Pulse-X.Y.Z-debug.apk` (necesita `JAVA_HOME` y `ANDROID_HOME`) |
| `npm run android:release` | Lo mismo firmado → `dist/Pulse-X.Y.Z.apk`, con la keystore de `PULSE_KEYSTORE`, `PULSE_KEYSTORE_PASSWORD`, `PULSE_KEY_ALIAS` y `PULSE_KEY_PASSWORD` |
| `npm run android:bundle` | App Bundle firmado con esa keystore → `dist/Pulse-X.Y.Z.aab`: lo que se sube a Google Play |
| `npm run android:build` / `android:run` | Solo `www/` + `cap sync` / compilar y abrir en el emulador o móvil por USB |
| `npm run test:e2e:android` | Prueba de humo del **APK ya instalado** (`adb install -r dist/Pulse-*-debug.apk` antes) en el emulador contra el S3 falso; capturas `android-*.png` |

Electron 45 descarga su binario la primera vez que se usa; para forzarlo: `node node_modules/electron/install.js`.

## Estructura

```
src/backend/     lógica común a Electron y Android, SIN Node ni Electron (lo comprueba tests/backend/portable.test.js):
                 la plataforma inyecta `files` (leer/escribir por nombre), `crypto`, `http`, `toTrack` (URLs) y `collect`
  paths.js       basename/extname POSIX y nombre de carátula
  s3/           storage.js (SDK: leer, subir y, solo para la papelera, copiar y borrar; admite otro requestHandler), connection.js (conexión
                 con la clave secreta cifrada por el `crypto` inyectado), service.js
  library/       remote.js (id s3://bucket/clave, etiquetas leyendo el principio del objeto), sync.js
                 (biblioteca = bucket), upload.js (sube lo que da `collect`: {name,size,open}), trash.js (papelera del bucket),
                 metadata.js (copia en
                 metadatos/ del bucket), lists.js (listas de canciones: lists.js aquí y metadatos/listas.json),
                 favorites.js (favoritos: favorites.json y metadatos/favoritos.json), recents.js (recientes:
                 recents.json y metadatos/recientes.json), shared.js (lo que comparten listas, favoritos y
                 recientes: guardar aquí, subir, juntar copias por `updatedAt`),
                 tracks.js (registro ↔ pista), store.js (library.json: caché local), covers.js (carátulas
                 incrustadas en covers/: se guardan al sincronizar y se leen del bucket como mucho 4 a la vez)
  online/        datos de internet: matching, itunes, deezer, lrclib, http, enricher, queue (ver abajo)
src/main/        adaptador de Electron (NO forma parte del mediator)
  main.js        ventana, instancia única, sin navegación, --lang=es
  files.js       `files` sobre fs en userData; library/collect.js recorre archivos y carpetas para subir
  protocol/      media://track|cover/<id>: audio desde S3 con rangos, solo pistas de la biblioteca (403 si no)
  ipc/           library.js (library:*, connection:*), metadata.js (metadata:*), lists.js (lists:*), favorites.js
                 (favorites:*) y recents.js (recents:*); los usa el preload
src/preload/preload.cjs   window.api (contextBridge, sandbox)
src/android/     window.api de Android sobre el mismo backend (esbuild → www/api.js, antes que app.js)
  api.js         mismos métodos que el preload; audio con URLs firmadas de S3 (7 días)
  main.js        punto de entrada con los plugins reales (Filesystem, SecureStorage, App, CapacitorHttp)
  nativeHttp.js  red nativa sin CORS (y requestHandler del SDK de S3); files.js, secret.js (Keystore),
                 covers.js (carátulas en el móvil), downloads.js (canciones sin conexión), picker.js, backButton.js
  mediaSession.js navigator.mediaSession (y MediaMetadata) sobre el plugin nativo PulsePlayback
android/         proyecto Gradle de Capacitor (la versión se lee de package.json); www/ se genera y no va al repo
  app/src/main/java/…/  PlaybackService (servicio en primer plano + MediaSession) y PlaybackPlugin
src/renderer/
  app.js         raíz de composición: crea colegas → PlayerMediator → app-ready
  core/          Mediator (solo enruta) y Colleague
  mediator/      PlayerMediator (solo compone), events.js, actions.js, handlers/ (uno por caso de uso)
  colleagues/    modelos (Catalog, Playlist = la cola, Lists = listas del usuario, Favorites, Recents, Settings,
                 Session = lo que sonaba al cerrar, para retomarlo),
                 servicios (AudioEngine, LibraryService, MediaSessionBridge, SleepTimer) y vistas (Router, HomeView,
                 PlaylistView, SearchView, NowPlayingView, ControlsView, ToastView, ConnectionView,
                 ListDialog, KeyboardShortcuts)
  ui/            piezas de UI sin estado de negocio (dom, icons, cover, format, trackList, transport, menu: el «⋯»
                 de las filas, con todas sus opciones; en el móvil es su único botón, reorder: arrastrar filas con
                 el asa y Alt+↑/↓)
  lib/           utilidades puras (storage, text, artists: separar colaboraciones)
  styles/        tokens.css (único sitio con valores), layout.css, components.css
tests/           unitarios por carpeta + helpers/ (fakeContext, fakeS3, WAV con ID3, FakeAudio) + e2e/
```

## Reglas del patrón (obligatorias; varias las comprueba `tests/mediator/rules.test.js`)

1. Los colegas **nunca** se conocen: solo importan `core/Colleague.js`, `mediator/events.js`, `ui/` y `lib/`.
2. Un colega expone métodos propios y avisa con `this.notify(EVENTS.X, payload)`. No hay event bus: nadie se suscribe a nadie.
3. Toda coordinación vive en `mediator/handlers/`: un módulo por caso de uso, **≤ 80 líneas**, sin estado y sin importar colegas. Coordinación repetida → `mediator/actions.js`.
4. `PlayerMediator` solo compone (colegas + `.use(módulo)`): ni `if` ni `switch`.
5. Eventos en kebab-case, solo los de `mediator/events.js` (con su payload documentado).
6. La lógica de un solo colega va dentro de él (aleatorio/repetir en `Playlist`, búsqueda y agrupación en `Catalog`, volumen, precarga y fundido en `AudioEngine`). Las vistas pintan y emiten; su único estado es de UI (filtro de chips, letra desplegada…).
7. `Mediator.notify()` inicia los handlers en orden, no deja que uno lento bloquee a otro y aísla sus errores.
8. Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP de `index.html`. Nada de `innerHTML` con datos de archivos: usa `h()` de `ui/dom.js`.

## Reproducción sin cortes y fundido

- `AudioEngine` tiene dos `<audio>` (el segundo, `standby`, lo crea `app.js`). A 20 s del final emite `near-end`;
  `handlers/crossfade.js` precarga ahí `Playlist.upcoming()` y `load()` de esa URL solo cambia de elemento.
- "Fundido" en la sidebar (0–8 s, guardado en `crossfade`): `ended` llega esos segundos antes y las dos pistas se cruzan.
  Solo cuenta el elemento activo; volumen, silencio y salida (`setSinkId`) se aplican a los dos.

## Música en S3

- La conexión (servidor, claves, bucket, carpeta) se configura en la app ("Conexión S3" en la sidebar, o el
  formulario que se abre la primera vez) o importando un `credentials.json` (formato MinIO o estilo AWS).
- **Las claves no van en el repo ni en el instalador.** Se guardan en `userData/s3.json` con la clave secreta
  cifrada (`safeStorage`: DPAPI en Windows, llavero en Linux) y la clave secreta nunca vuelve a la ventana.
- La biblioteca es el contenido del bucket (`sync.js`): se sincroniza al arrancar, al volver a la ventana
  (como mucho cada 15 s) y con "Actualizar biblioteca". Nuevo, cambiado (ETag) o borrado → `library-changed`.
- "Tu biblioteca" se ordena (añadidas recientemente, por la fecha de subida `addedAt` del listado; título, artista,
  álbum o año: `Catalog.library()`, recordado en `Settings`) y se filtra con el campo de su cabecera (handler `librarySort.js`).
- Las etiquetas se leen descargando solo los primeros 512 KB (más si la etiqueta ID3 es grande). Las que están
  al final de archivos grandes no se leen; con "Datos de internet" se completan desde el nombre del archivo.
- **Carátulas incrustadas**: al leer las etiquetas, la imagen se guarda en `covers/` (`covers.js`; en Android,
  `src/android/covers.js`), así no se vuelve a descargar el archivo para pintarla. Si falta, se lee del bucket
  (máx. 4 a la vez). Un fallo de red **no** cuenta como "sin carátula": el protocolo responde 503 y la vista
  reintenta una vez; "no tiene" sí se recuerda.
- **Subir canciones**: botón "Subir canciones" (diálogo del main) o arrastrar archivos/carpetas a la ventana
  (`webUtils.getPathForFile` en el preload). `upload.js` sube de una en una bajo la carpeta de la conexión
  (una carpeta conserva su nombre: "Disco/01.mp3"), **nunca sobrescribe** (mismo archivo → se salta; otro con
  ese nombre → "Nombre (2).mp3") y sincroniza al terminar. Claves sin permiso de escritura → mensaje claro.
- **Eliminar canciones** (`trash.js`): "Eliminar del bucket" en el "⋯" de cada fila, con confirmación (`TrashDialog`,
  handler `trash.js`). **No se borra al momento**: se copia a `papelera/` bajo la carpeta de la conexión (conserva su
  carpeta, nunca pisa: "Nombre (2).mp3"), se borra el original y sale de la biblioteca; los demás Pulse la quitan en
  su próxima sincronización. `listAudio()` no ve la papelera. "Papelera" en Tu música la restaura a su sitio
  (sincroniza) o la vacía con doble pulsación: **es lo único que borra para siempre**. Listas y favoritos no se
  tocan (al restaurarla vuelve a estar en ellos); en Android se quita su descarga. `copy` y `remove` de
  `storage.js` solo los usa `trash.js`: nada más en Pulse borra del bucket.
- **Metadatos en el bucket** (`metadata.js`), bajo la carpeta de la conexión: `metadatos/biblioteca.json` (todos los
  datos de cada canción: etiquetas leídas e internet) y `metadatos/caratulas/<sha1>.jpg` (carátulas de internet,
  por nombre: `coverName`). Cada guardado de la biblioteca se sube a los 5 s (máx. 60 s), al arrancar y antes de
  cerrar; si falla, se reintenta al minuto. Cada sincronización lo lee primero: lo que tenga el mismo ETag no se
  relee del archivo y los datos de internet más recientes (`lookupStamp`) llegan como `tracks-updated`.
  `library.json` y `covers/` en userData quedan como caché (arranque al momento y sin conexión).
- **Listas de canciones** (`lists.js`): `metadatos/listas.json` bajo la carpeta de la conexión, compartidas por
  todos los Pulse de ese bucket. Cada cambio se guarda al momento en `lists.json` y se sube a los 2 s; se traen al
  arrancar, al volver a la ventana y con "Actualizar biblioteca" (`lists-changed`). Al juntar dos copias gana, por
  lista, la de `updatedAt` mayor; las borradas quedan como marca (`deleted`) para no resucitar. Si no se puede leer
  el bucket no se sube nada (no se pisan las de otros). Handlers: `lists.js` y `listTracks.js`.
- **Favoritos** (`favorites.js`, sobre el mismo `shared.js` que las listas): `metadatos/favoritos.json`, un registro
  por canción (`deleted` al desmarcarla, para que otra copia no la vuelva a marcar). Se guardan en `favorites.json`,
  se suben a los 2 s y llegan como `favorites-changed`. El corazón cambia al momento y, si el main no puede guardarlo,
  vuelve atrás. Los de antes (en `localStorage`, solo de ese equipo) se suben una vez al arrancar con `import()`.
- **Escuchado recientemente** (`recents.js`, sobre `shared.js`): `metadatos/recientes.json`, un registro por canción
  con la última vez que sonó (gana la escucha más reciente; se guardan 100 y se ven 12). Se suben a los 2 s y llegan
  como `recents-changed`; los de antes (en `localStorage`) se suben una vez al arrancar con `import()`.
- Si una canción falla al sonar se comprueba en el bucket (`library:verify`); si ya no está, se quita.
- Los tests nunca usan el S3 real: `tests/helpers/fakeS3.js` es un servidor S3 mínimo (listar, rangos, subidas, 403, solo lectura…).

## Android (Capacitor 8)

- Mismo renderer: el diseño móvil son reglas `@media (max-width: 720px)` en `layout.css` (tab bar abajo con la
  pestaña "Tu música" para conexión, subir, actualizar y datos de internet; mini-player; safe-area). El mediator
  y los handlers no saben de plataformas; `index.html` de Android lo genera `scripts/build-android.mjs` (CSP con
  `media-src https: http:`, `data-platform="android"`).
- La clave secreta va al **Android Keystore** (`@aparajita/capacitor-secure-storage`); en `s3.json` solo queda
  la marca `keystore`. En Android no hay proceso main: el secreto vive en el JS de la app (en su sandbox).
- Toda la red (S3, iTunes, Deezer, LRCLIB) va por `CapacitorHttp` nativo (sin CORS); el `<audio>` usa URLs
  firmadas que piden rangos directamente al bucket.
- Detalles que rompen si se tocan: `server.androidScheme: 'http'` (con https el audio http de un MinIO local es
  contenido mixto y se bloquea), `usesCleartextTraffic`, y `stat()` con GET de un byte (CapacitorHttp rechaza
  un HEAD con 404). `files.js` mira si algo existe listando su carpeta: cada rechazo del plugin ensucia la consola.
  Un cuerpo `application/json` el plugin lo escribe tal cual (sin decodificar el base64 de `dataType: 'file'`):
  `nativeHttp.js` lo manda como texto.
- Entorno local: JDK 21 (`JAVA_HOME`) y SDK de Android (`ANDROID_HOME`: platform-tools, platforms;android-36,
  build-tools, emulador). El emulador, **con ventana y la GPU por defecto**
  (`emulator -avd pulse -no-boot-anim -audio none -no-snapshot-save`): sin ventana se cae al reproducir audio.
  El e2e levanta el S3 falso en `0.0.0.0` y el emulador lo ve en `10.0.2.2`. Silencia bajando a 0 el volumen
  multimedia del sistema (y lo restaura), **no** con el silencio de Pulse: con el `<audio>` silenciado Chromium no
  abre salida de audio, Android no ve a Pulse sonando y no le pasa las teclas de los auriculares.
- **Segundo plano**: sin un servicio en primer plano, Android silencia el audio del WebView al salir de la app
  ("AudioHardening" en logcat). `PlaybackService` (`mediaPlayback`) vive mientras hay pista: notificación con
  controles, MediaSession (pantalla de bloqueo, auriculares) y wake lock solo mientras suena. El WebView no trae la
  Media Session API: `src/android/mediaSession.js` la imita y `MediaSessionBridge` no sabe de Android. Probado con la
  pantalla apagada y Doze forzado; el e2e comprueba que sigue sonando con la app en segundo plano.
- **Descargas sin conexión** (solo Android, `src/android/downloads.js`): botón "Descargar" en listas, favoritos y
  álbumes; se bajan de una en una desde la URL firmada con `Filesystem.downloadFile` a `downloads/` (en
  `downloads.json`: archivo, ETag y tamaño). Mientras el ETag no cambie, la pista suena del archivo local; si cambió
  en el bucket, vuelve a sonar desde S3. "Tu música" cuenta lo descargado y lo borra. `downloadFile` no crea la
  carpeta aunque se le pida `recursive`: `main.js` la crea antes. En Electron `canDownload()` es falso y no hay botón.
- **Firma**: la keystore de release no va al repo (`*.jks` ignorado). En CI llega de los secretos
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`; sin ellos
  sale el debug. Si se pierde la keystore, las versiones nuevas no se instalan encima: hay que guardar copia.
  En Google Play es la *clave de subida* (Google firma con la suya: firma de apps de Google Play).
- **Google Play** (`com.marmol89.pulse`): cada versión sube el `.aab` a la **prueba interna** con la cuenta de
  servicio del secreto `PLAY_SERVICE_ACCOUNT_JSON` (usuario de Play Console con permiso de publicar en pruebas) y
  las notas de `scripts/notas-play.mjs` (su entrada del CHANGELOG). Sin ese secreto, se sube a mano en Play Console.

## Datos de internet (carátula, álbum, año, género, pista y letra)

- Fuentes gratuitas y sin clave: **iTunes Search API** (datos y carátula 600×600, catálogo `ES`), **Deezer** si iTunes
  no tiene la canción (datos sin género/año y carátula) y **LRCLIB** (letra). Todo en `src/backend/online/` con el `http` de la plataforma (`net.fetch` en el main de Electron, `CapacitorHttp` en Android); el renderer no sale a internet.
- **Rellena huecos, nunca pisa etiquetas**: título y artista solo se toman de internet si el título venía del
  nombre del archivo: se prueban "Artista - Título" y "Título - Artista" con una sola búsqueda por servicio. `matching.js` rechaza otras versiones (remix, directo, idiomas…),
  otros artistas y duraciones que no encajan: mejor no encontrar nada que poner datos equivocados.
- La pista que empieza a sonar se completa al momento (letra incluida); el resto, en segundo plano
  (`queue.js`: una pista cada 3,5 s, ~17/min, por debajo del límite de iTunes). Lo no encontrado se marca y no se repite
  (salvo una vez al subir `LOOKUP_VERSION` en `enricher.js`, cuando la búsqueda mejora). Si LRCLIB falla un
  momento (da 503 a ratos), se guardan los datos y solo la letra queda pendiente.
- LRCLIB da también la letra **sincronizada** (`syncedLyrics`, formato LRC, versión de letra `LYRICS_VERSION`): en
  Reproduciendo se resalta el verso que suena (`lib/lrc.js`) y pulsar uno salta a él. La letra del archivo no se pisa.
- Se guarda en `library.json` y las carátulas en `userData/covers/` (compartidas por álbum): funciona sin conexión.
- **Fotos de artista** (`online/artists.js`): Deezer `/search/artist` (mismo nombre y foto de verdad), de una en una en
  segundo plano y solo con "Datos de internet". Se guardan en `covers/` y lo buscado en `artists.json` (solo en ese
  equipo, no van al bucket). La ventana las pide al cambiar la biblioteca (`artists:pictures`) y las nuevas llegan como
  `artist-pictures-changed`; en Electron se sirven por `media://artist/<archivo>` (solo fotos de artista).
- **Privacidad**: envía título y artista a esos servicios. Interruptor "Datos de internet" en la sidebar
  (`Settings`, activado por defecto). "Buscar en internet" en Reproduciendo fuerza la búsqueda de una pista.
- El e2e la desactiva antes de importar: los tests nunca llaman a servicios reales (los unitarios usan `fakeFetch`).

## Añadir una funcionalidad

1. Si hace falta, un colega nuevo en `colleagues/` que extienda `Colleague`, creado en `app.js`.
2. Sus eventos en `mediator/events.js`.
3. Un **módulo nuevo** en `mediator/handlers/` registrado con `.use()` en `PlayerMediator` (solo gana esa línea), con su test en `tests/handlers/`.

## Versiones y publicación

- **release-please** (`.github/workflows/versiones.yml`, `release-please-config.json`): cada push a `main` mantiene
  la PR "chore: versión X.Y.Z" con `CHANGELOG.md` y la versión de `package.json` (`feat` → menor, `fix` → parche;
  `docs`/`ci`/`chore`… no sacan versión). Solo la fusiona el admin. Al fusionarla: etiqueta `vX.Y.Z`, release y
  `instaladores.yml` compila en Windows (`Pulse-Setup-X.Y.Z.exe`), Linux (AppImage + `.deb`) y Android
  (`Pulse-X.Y.Z.apk` firmado) y los adjunta.
- **No toques a mano** la versión de `package.json`, `CHANGELOG.md` ni `.release-please-manifest.json`.
- "Instaladores" se puede lanzar a mano en Actions: deja los instaladores como artefactos sin publicar nada.
- `main` solo admite PR; `.github/CODEOWNERS` pide la revisión del admin (que puede fusionar sus propias PR).

## Convenciones

- Todo en español: UI, documentación y commits.
- **Commits pequeños** (uno por pieza), estilo Conventional Commits (`feat(ui): …`, `fix(core): …`).
- CSS: colores, radios y tamaños de fuente solo con tokens de `tokens.css` (lo comprueba `tests/ui/styles.test.js`).
- Antes de dar algo por terminado: `npm test` y, si cambia la UI o el main, `npm run test:e2e` revisando las capturas frente al diseño.
  Si cambia la UI de móvil, el backend o `src/android/`: `npm run android:apk`, instalarlo y `npm run test:e2e:android`.
- **Si se toca la interfaz, se comprueba que se ve bien** con la skill `revisar-interfaz`: capturas de escritorio y
  de móvil (`node .claude/skills/revisar-interfaz/capturas-movil.mjs`, a 412×915 y sin emulador) revisadas una a una.
  En el móvil, nada de varios botones en una fila: un solo «⋯» (`ui/menu.js`) con las opciones.
