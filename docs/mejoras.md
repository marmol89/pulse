# Mejoras de Pulse (segunda ronda)

Lista sacada de revisar el código el 26/10/2026, después de la 0.6.0. La primera ronda (cola editable, retomar,
letra sincronizada, fundido, papelera, descargas…) ya está hecha y es parte del `CHANGELOG.md`.

Cada mejora sigue la receta de `CLAUDE.md` ("Añadir una funcionalidad"): eventos nuevos en `mediator/events.js`,
un handler nuevo en `mediator/handlers/` (≤ 80 líneas, con su test) y la lógica de un solo colega dentro de él.
Cada una va en su rama y su PR, con commits pequeños.

Leyenda del esfuerzo: **S** (un par de commits), **M** (una PR normal), **L** (varias piezas o toca el main y Android).

| # | Mejora | Esfuerzo | Plataformas | Estado |
|---|---|---|---|---|
| 1 | Volumen uniforme (ReplayGain) | M | todas | ✅ |
| 2 | Ecualizador | M | escritorio | ☐ |
| 3 | Contador de escuchas y listas inteligentes | M | todas | ☐ |
| 4 | Bandeja del sistema y botones en la barra de tareas | M | escritorio | ☐ |
| 5 | Mini-reproductor | M | escritorio | ☐ |
| 6 | Exportar e importar listas (M3U) | M | todas | ☐ |
| 7 | Editar los datos de una canción | L | todas | ☐ |
| 8 | Actualizaciones automáticas | M | escritorio | ☐ |

---

## 1. Volumen uniforme (ReplayGain)

**Qué pasa:** cada canción suena al volumen con el que se masterizó; en una biblioteca mezclada hay que tocar el
volumen a cada rato.

**Propuesta:**
- `tracks.js` guarda `replayGain: { track, album }` (dB) de `common.replaygain_track_gain` /
  `replaygain_album_gain` de music-metadata (ID3 `TXXX`, Vorbis, `R128_*` de Opus). Las pistas ya leídas no lo
  tienen: subir la versión del registro para que la próxima sincronización las relea una vez.
- `AudioEngine.setTrackGain(dB)`: multiplica el volumen del elemento por `10^(dB/20)`, con el tope de 1 (un
  `<audio>` no puede subir por encima del 100 %: las pistas bajas no se suben). Se aplica a los dos elementos,
  respetando el fundido. Nada de Web Audio: funciona igual en Android y en segundo plano.
- "Volumen uniforme" en la sidebar (y en Tu música en el móvil): *Desactivado*, *Por canción* o *Por disco*,
  guardado por `AudioEngine` como el fundido. Por defecto, *Por canción*.
- Handler `loudness.js`: al cargar una pista (`loadTrack` en `actions.js`) le pasa su ganancia según el modo.

**Límite:** solo vale para las canciones con etiqueta ReplayGain. Medir las que no la tienen pide decodificar el
audio; queda como continuación del ecualizador (punto 2), que ya monta la cadena de Web Audio en escritorio.

**Pruebas:** `tests/backend/` (lee la ganancia de un WAV con `TXXX:REPLAYGAIN_TRACK_GAIN`),
`tests/colleagues/AudioEngine.test.js` (volumen con ganancia y con fundido) y `tests/handlers/loudness.test.js`.

## 2. Ecualizador

**Propuesta:**
- Cinco bandas (60 Hz, 230 Hz, 910 Hz, 3,6 kHz y 14 kHz, ±12 dB) con `BiquadFilterNode` y preajustes (Plano,
  Graves, Voces, Agudos, Acústico, Electrónica). Diálogo "Ecualizador" desde la sidebar.
- La cadena de Web Audio se monta **solo la primera vez que el ecualizador deja de estar plano**: hasta entonces,
  nada cambia. `media://` ya es `corsEnabled`; las respuestas de audio necesitan `Access-Control-Allow-Origin` y los
  `<audio>` `crossOrigin = 'anonymous'`.
- Con la cadena montada, la salida elegida se aplica con `AudioContext.setSinkId()` (el del elemento deja de contar).
- **Solo escritorio**: en Android el audio viene de URLs firmadas de otro origen (haría falta CORS en el bucket) y el
  WebView en segundo plano depende de que el `<audio>` suene directamente. `canEqualize()` es falso y no se ve.

**Pruebas:** `tests/colleagues/Equalizer.test.js` con un `AudioContext` falso, handler `equalizer.js` y e2e
(abrir el diálogo, elegir un preajuste, sigue sonando y sin errores de consola).

## 3. Contador de escuchas y listas inteligentes

**Propuesta:**
- Una escucha cuenta cuando la pista suena 30 s o la mitad de su duración (lo que llegue antes), no al empezar.
- Backend `plays.js` sobre `shared.js`: `metadatos/escuchas.json`, un registro por canción con el número de
  escuchas **por equipo** (`{ equipo: n }`); al juntar dos copias gana el mayor de cada equipo y el total es la
  suma. Así dos Pulse que escuchan a la vez no se pisan. Llegan como `plays-changed`.
- Colecciones nuevas en Inicio y Biblioteca: **Más escuchadas** (top 50), **Sin escuchar** y **Añadidas
  recientemente** (últimos 30 días), resueltas en `Catalog` / `actions.resolveCollection`.
- En las carpetas del equipo, solo en ese equipo (`plays-local.json`), como listas y favoritos.

**Pruebas:** `tests/backend/plays.test.js` (juntar copias de dos equipos), `tests/handlers/plays.test.js`
(30 s / mitad, una sola vez por reproducción) y las colecciones en `Catalog.test.js`.

## 4. Bandeja del sistema y botones en la barra de tareas

**Qué pasa:** al cerrar la ventana se corta la música, y para pausar hay que traerla delante. (Las teclas
multimedia del teclado ya funcionan con la ventana en segundo plano gracias a la Media Session de Chromium).

**Propuesta:**
- Icono en la bandeja con menú: canción actual, Reproducir/Pausa, Siguiente, Anterior, Mostrar Pulse y Salir.
- "Al cerrar, seguir en la bandeja" en la sidebar (desactivado por defecto): cerrar la ventana la oculta y la
  música sigue; "Salir" del menú cierra de verdad.
- Windows: botones Anterior / Reproducir / Siguiente en la miniatura de la barra de tareas (`setThumbarButtons`).
- Colega nuevo `DesktopBridge` (como `MediaSessionBridge`): recibe el estado y emite `play-toggle`, `next` y
  `previous`. Usa `window.api.desktop`, que en Android no existe (no hace nada).

**Pruebas:** `tests/main/` (menú y botones según el estado), `tests/colleagues/DesktopBridge.test.js` y e2e
(órdenes simuladas desde el main).

## 5. Mini-reproductor

**Propuesta:**
- Botón en la barra del reproductor (y atajo `Ctrl+M`): la ventana pasa a 360×120, siempre encima, con carátula,
  título, artista, transporte y barra de progreso. El mismo botón (o doble clic en la carátula) vuelve al tamaño
  anterior.
- Es la **misma ventana** con la clase `.app.is-mini` (CSS) y un IPC `window:set-mini` que cambia tamaño, mínimo y
  "siempre encima": no hay segunda ventana ni estado duplicado.
- Solo escritorio (`canMini()` falso en Android).

**Pruebas:** e2e con captura del mini-reproductor y vuelta al tamaño normal; `revisar-interfaz`.

## 6. Exportar e importar listas (M3U)

**Propuesta:**
- "Exportar (.m3u8)" en el «⋯» de una lista, de Favoritos y de un álbum: `#EXTM3U` con `#EXTINF:duración,Artista -
  Título` y la clave de cada canción (la ruta en las carpetas del equipo).
- "Importar lista" en Tu música: lee un `.m3u`/`.m3u8` y busca cada entrada en la biblioteca por la clave, luego
  por el nombre del archivo y por último por "Artista - Título" (`lib/m3u.js`, puro). Crea la lista con lo
  encontrado y avisa de cuántas no estaban.
- Electron: diálogos de guardar/abrir del main. Android: importar con el selector de archivos (`picker.js`) y
  exportar a Documentos (`Filesystem`).

**Pruebas:** `tests/lib/m3u.test.js` (formatos, rutas de Windows y relativas, BOM, emparejado) y handler `m3uLists.js`.

## 7. Editar los datos de una canción

**Qué pasa:** si una canción tiene mal el título o el artista solo se arregla cambiando el archivo y volviéndolo a
subir.

**Propuesta:**
- "Editar datos" en el «⋯» de cada fila y en Reproduciendo: título, artista, artista del álbum, álbum, año, género
  y número de pista.
- **No toca el archivo**: lo editado se guarda aparte en el registro (`edited` + `editedAt`) y gana a las etiquetas
  y a internet. Viaja en `metadatos/biblioteca.json` (gana el `editedAt` más reciente), así que se ve en todos los
  Pulse del bucket. En las carpetas del equipo, solo en ese equipo.
- Si se edita título o artista, la búsqueda de internet usa lo editado (y se puede repetir).
- "Restaurar datos del archivo" quita lo editado.

**Pruebas:** `tests/backend/` (`toTrack` con `edited`, juntar copias), handler `editTrack.js`, diálogo en e2e.

## 8. Actualizaciones automáticas

**Propuesta:**
- `electron-updater` con el proveedor de GitHub (releases de `marmol89/pulse`): comprueba al arrancar y cada 6 h,
  descarga en segundo plano y se instala al cerrar. Aviso "Pulse X.Y.Z está lista: se instalará al cerrar" con
  "Reiniciar ahora" en la sidebar.
- Windows (NSIS) y Linux AppImage; el `.deb` no se actualiza solo (lo hace el gestor de paquetes).
- `instaladores.yml` debe adjuntar también `latest.yml`, `latest-linux.yml` y los `.blockmap`.
- Solo en la app instalada (`app.isPackaged`): en desarrollo y en el e2e no hace nada.

**Pruebas:** `tests/main/updates.test.js` con un `autoUpdater` falso (estados y avisos).

---

## Cómo se cierra cada mejora

1. Rama propia y commits pequeños (`feat(audio): …`, `feat(backend): …`, `feat(ui): …`).
2. `npm test` y, si toca UI o main, `npm run test:e2e` revisando las capturas; si toca la interfaz, la skill
   `revisar-interfaz` (escritorio y móvil).
3. Si toca la UI móvil, el backend o `src/android/`: `npm run android:apk`, instalar y `npm run test:e2e:android`.
4. Actualizar `CLAUDE.md` y el README si cambia una regla, una pieza de la estructura o lo que ve el usuario.
5. Marcar la mejora como hecha en esta tabla y PR a `main`.
