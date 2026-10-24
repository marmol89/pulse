# Pulse — reproductor de música (Electron + patrón Mediator)

Reproductor nativo para **Windows y Linux** en JavaScript puro (sin frameworks de UI). **La música viene de un bucket S3**
(o compatible, como MinIO); las canciones del ordenador se suben al bucket. Diseño de referencia:
`app-musica-figma.svg` (móvil) y su adaptación a escritorio en `.claude/skills/iniciar-proyecto/reference/diseno.md`.
La skill `iniciar-proyecto` es la fuente de las reglas de abajo: tenla presente antes de tocar código.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca la app en desarrollo |
| `npm test` | Tests unitarios (`node:test`, Node ≥ 22) |
| `npm run test:e2e` | Prueba de humo de la app real (playwright-core) contra un **S3 falso** (`tests/helpers/fakeS3.js`): abre la ventana unos segundos, audio silenciado, capturas en `tests/e2e/output/` |
| `npm run icons` | Regenera `src/assets/icon.png` |
| `npm run dist:win` / `npm run dist:linux` | Instaladores en `dist/` (NSIS / AppImage + deb). Lento: solo cuando se pida. El `.deb`/AppImage, mejor desde Linux, WSL o CI |

Electron 45 descarga su binario la primera vez que se usa; para forzarlo: `node node_modules/electron/install.js`.

## Estructura

```
src/main/        proceso main (NO forma parte del mediator)
  main.js        ventana, instancia única, sin navegación, --lang=es
  s3/           storage.js (SDK: leer y subir, nunca borra), connection.js (conexión cifrada con safeStorage), service.js
  protocol/      media://track|cover/<id>: audio desde S3 con rangos, solo pistas de la biblioteca (403 si no)
  library/       remote.js (id s3://bucket/clave, etiquetas leyendo el principio del objeto), sync.js
                 (biblioteca = bucket), upload.js (subir archivos y carpetas), metadata.js (copia en
                 metadatos/ del bucket), tracks.js (registro ↔ pista), store.js (library.json: caché local)
  online/        datos de internet: matching, itunes, deezer, lrclib, http, enricher, queue (ver abajo)
  ipc/           library.js (library:*, connection:*) y metadata.js (metadata:*); los usa el preload
src/preload/preload.cjs   window.api (contextBridge, sandbox)
src/renderer/
  app.js         raíz de composición: crea colegas → PlayerMediator → app-ready
  core/          Mediator (solo enruta) y Colleague
  mediator/      PlayerMediator (solo compone), events.js, actions.js, handlers/ (uno por caso de uso)
  colleagues/    modelos (Catalog, Playlist, Favorites, Recents, Settings), servicios (AudioEngine,
                 LibraryService, MediaSessionBridge) y vistas (Router, HomeView, PlaylistView,
                 SearchView, NowPlayingView, ControlsView, ToastView, ConnectionView, KeyboardShortcuts)
  ui/            piezas de UI sin estado de negocio (dom, icons, cover, format, trackList, transport)
  lib/           utilidades puras (storage, text)
  styles/        tokens.css (único sitio con valores), layout.css, components.css
tests/           unitarios por carpeta + helpers/ (fakeContext, fakeS3, WAV con ID3, FakeAudio) + e2e/
```

## Reglas del patrón (obligatorias; varias las comprueba `tests/mediator/rules.test.js`)

1. Los colegas **nunca** se conocen: solo importan `core/Colleague.js`, `mediator/events.js`, `ui/` y `lib/`.
2. Un colega expone métodos propios y avisa con `this.notify(EVENTS.X, payload)`. No hay event bus: nadie se suscribe a nadie.
3. Toda coordinación vive en `mediator/handlers/`: un módulo por caso de uso, **≤ 80 líneas**, sin estado y sin importar colegas. Coordinación repetida → `mediator/actions.js`.
4. `PlayerMediator` solo compone (colegas + `.use(módulo)`): ni `if` ni `switch`.
5. Eventos en kebab-case, solo los de `mediator/events.js` (con su payload documentado).
6. La lógica de un solo colega va dentro de él (aleatorio/repetir en `Playlist`, búsqueda y agrupación en `Catalog`, volumen en `AudioEngine`). Las vistas pintan y emiten; su único estado es de UI (filtro de chips, letra desplegada…).
7. `Mediator.notify()` inicia los handlers en orden, no deja que uno lento bloquee a otro y aísla sus errores.
8. Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP de `index.html`. Nada de `innerHTML` con datos de archivos: usa `h()` de `ui/dom.js`.

## Música en S3

- La conexión (servidor, claves, bucket, carpeta) se configura en la app ("Conexión S3" en la sidebar, o el
  formulario que se abre la primera vez) o importando un `credentials.json` (formato MinIO o estilo AWS).
- **Las claves no van en el repo ni en el instalador.** Se guardan en `userData/s3.json` con la clave secreta
  cifrada (`safeStorage`: DPAPI en Windows, llavero en Linux) y la clave secreta nunca vuelve a la ventana.
- La biblioteca es el contenido del bucket (`sync.js`): se sincroniza al arrancar, al volver a la ventana
  (como mucho cada 15 s) y con "Actualizar biblioteca". Nuevo, cambiado (ETag) o borrado → `library-changed`.
- Las etiquetas se leen descargando solo los primeros 512 KB (más si la etiqueta ID3 es grande). Las que están
  al final de archivos grandes no se leen; con "Datos de internet" se completan desde el nombre del archivo.
- **Subir canciones**: botón "Subir canciones" (diálogo del main) o arrastrar archivos/carpetas a la ventana
  (`webUtils.getPathForFile` en el preload). `upload.js` sube de una en una bajo la carpeta de la conexión
  (una carpeta conserva su nombre: "Disco/01.mp3"), **nunca sobrescribe** (mismo archivo → se salta; otro con
  ese nombre → "Nombre (2).mp3") y sincroniza al terminar. Claves sin permiso de escritura → mensaje claro.
- **Metadatos en el bucket** (`metadata.js`), bajo la carpeta de la conexión: `metadatos/biblioteca.json` (todos los
  datos de cada canción: etiquetas leídas e internet) y `metadatos/caratulas/<sha1>.jpg` (carátulas de internet,
  por nombre: `coverName`). Cada guardado de la biblioteca se sube a los 5 s (máx. 60 s), al arrancar y antes de
  cerrar; si falla, se reintenta al minuto. Cada sincronización lo lee primero: lo que tenga el mismo ETag no se
  relee del archivo y los datos de internet más recientes (`lookupStamp`) llegan como `tracks-updated`.
  `library.json` y `covers/` en userData quedan como caché (arranque al momento y sin conexión).
- Si una canción falla al sonar se comprueba en el bucket (`library:verify`); si ya no está, se quita.
- Los tests nunca usan el S3 real: `tests/helpers/fakeS3.js` es un servidor S3 mínimo (listar, rangos, subidas, 403, solo lectura…).

## Datos de internet (carátula, álbum, año, género, pista y letra)

- Fuentes gratuitas y sin clave: **iTunes Search API** (datos y carátula 600×600, catálogo `ES`), **Deezer** si iTunes
  no tiene la canción (datos sin género/año y carátula) y **LRCLIB** (letra). Todo en el proceso main (`src/main/online/`) con `net.fetch`; el renderer no sale a internet.
- **Rellena huecos, nunca pisa etiquetas**: título y artista solo se toman de internet si el título venía del
  nombre del archivo: se prueban "Artista - Título" y "Título - Artista" con una sola búsqueda por servicio. `matching.js` rechaza otras versiones (remix, directo, idiomas…),
  otros artistas y duraciones que no encajan: mejor no encontrar nada que poner datos equivocados.
- La pista que empieza a sonar se completa al momento (letra incluida); el resto, en segundo plano
  (`queue.js`: una pista cada 3,5 s, ~17/min, por debajo del límite de iTunes). Lo no encontrado se marca y no se repite
  (salvo una vez al subir `LOOKUP_VERSION` en `enricher.js`, cuando la búsqueda mejora). Si LRCLIB falla un
  momento (da 503 a ratos), se guardan los datos y solo la letra queda pendiente.
- Se guarda en `library.json` y las carátulas en `userData/covers/` (compartidas por álbum): funciona sin conexión.
- **Privacidad**: envía título y artista a esos servicios. Interruptor "Datos de internet" en la sidebar
  (`Settings`, activado por defecto). "Buscar en internet" en Reproduciendo fuerza la búsqueda de una pista.
- El e2e la desactiva antes de importar: los tests nunca llaman a servicios reales (los unitarios usan `fakeFetch`).

## Añadir una funcionalidad

1. Si hace falta, un colega nuevo en `colleagues/` que extienda `Colleague`, creado en `app.js`.
2. Sus eventos en `mediator/events.js`.
3. Un **módulo nuevo** en `mediator/handlers/` registrado con `.use()` en `PlayerMediator` (solo gana esa línea), con su test en `tests/handlers/`.

## Convenciones

- Todo en español: UI, documentación y commits.
- **Commits pequeños** (uno por pieza), estilo Conventional Commits (`feat(ui): …`, `fix(core): …`).
- CSS: colores, radios y tamaños de fuente solo con tokens de `tokens.css` (lo comprueba `tests/ui/styles.test.js`).
- Antes de dar algo por terminado: `npm test` y, si cambia la UI o el main, `npm run test:e2e` revisando las capturas frente al diseño.
