# Mejoras propuestas para Pulse

Candidatas sacadas de revisar el código (octubre de 2026). **Nada de esto está decidido**: marca las que entran
y en qué orden, y el resto se borra o se queda como ideas.

Cada mejora sigue la receta de `CLAUDE.md` ("Añadir una funcionalidad"): eventos nuevos en `mediator/events.js`,
un handler nuevo en `mediator/handlers/` (≤ 80 líneas, con su test) y la lógica de un solo colega dentro de él.

Leyenda del esfuerzo: **S** (un par de commits), **M** (una PR normal), **L** (varias PR o toca Android nativo).

| # | Mejora | Esfuerzo | Plataformas | ¿Entra? |
|---|---|---|---|---|
| 1 | Cola editable: "Reproducir a continuación" y "Añadir a la cola" | M | todas | ☐ |
| 2 | Retomar donde lo dejaste (cola y posición al arrancar) | S | todas | ☐ |
| 3 | Letra sincronizada (karaoke) | M | todas | ☐ |
| 4 | Reordenar canciones de una lista | M | todas | ☐ |
| 5 | Temporizador de apagado | S | todas | ☐ |
| 6 | Recientes sincronizados por el bucket | S | todas | ☐ |
| 7 | Sin cortes entre pistas (gapless) y fundido opcional | L | todas | ☐ |
| 8 | Descargar canciones para escuchar sin conexión (Android) | L | Android | ☐ |
| 9 | Ordenar y filtrar la biblioteca | S | todas | ☐ |
| 10 | Borrar canciones del bucket | M | todas | ☐ |
| 11 | Vista de Artistas: nombres que se pisan y colaboraciones como un solo artista | S–M | todas | ☐ |
| 12 | Las carátulas incrustadas aparecen a poquitos, una tanda cada vez que se abre Pulse | M | todas | ☐ |

---

## 1. Cola editable

**Qué falta:** `Playlist` (la cola) solo se rellena con `setQueue()` al reproducir una colección; no se puede
meter una canción suelta detrás de la actual ni ver qué va a sonar.

**Propuesta:**
- Menú de cada pista en `ui/trackList.js`: "Reproducir a continuación" y "Añadir a la cola".
- `Playlist`: `playNext(tracks)`, `enqueue(tracks)`, `move(from, to)` y `removeAt(index)`, respetando el
  aleatorio (lo añadido a mano no se baraja).
- Vista "A continuación" en Reproduciendo (panel lateral en escritorio, hoja en móvil).
- Eventos: `play-next`, `enqueue`, `queue-move`, `queue-remove`; handler `queue.js`.

**Pruebas:** `tests/colleagues/Playlist.test.js` (orden con y sin aleatorio, repetir una/todo) y
`tests/handlers/queue.test.js`.

## 2. Retomar donde lo dejaste

**Qué falta:** al cerrar y abrir Pulse se pierde la cola, la pista y el segundo.

**Propuesta:**
- `Playlist.snapshot()` / `restore()` (ids de la cola, orden y posición) guardado con `lib/storage`.
- Guardar la posición cada ~5 s desde `time-update` y al pausar; al arrancar, cargar sin reproducir
  (`AudioEngine.load(url, false)` ya lo permite) y saltar al segundo guardado.
- Si alguna pista ya no está en la biblioteca, se quita de la cola restaurada.
- Handler `resume.js` sobre `app-ready`, `time-update` y `state-change`.

## 3. Letra sincronizada

**Qué falta:** `lrclib.js` solo usa `plainLyrics`; LRCLIB devuelve también `syncedLyrics` (formato LRC).

**Propuesta:**
- Guardar `syncedLyrics` junto a la letra en `library.json` y `metadatos/biblioteca.json` (subir
  `LOOKUP_VERSION` para que las pistas con letra ya buscada se completen una vez).
- Parser LRC puro en `lib/` con su test.
- `NowPlayingView` resalta la línea actual con `time-update` y hace scroll suave; tocar una línea → `seek`.
- Sin letra sincronizada, se ve la normal como ahora.

## 4. Reordenar canciones de una lista

**Qué falta:** `lists.js` añade y quita, pero no mueve.

**Propuesta:**
- `moveTrack(id, from, to)` en el backend y en el colega `Lists`; cambia `updatedAt` de la lista, así que el
  juntado de copias ya existente sirve tal cual.
- Arrastrar en `PlaylistView` (escritorio) y asa de arrastre táctil (móvil), más atajos de teclado
  (Alt+↑/↓) por accesibilidad.
- Evento `move-in-list` ({ id, from, to }); va en `listTracks.js` si cabe en las 80 líneas, si no, handler propio.

## 5. Temporizador de apagado

**Propuesta:** "Parar en 15/30/60 min" o "al acabar esta canción" desde Reproduciendo. Colega `SleepTimer`
(servicio con su `setTimeout`, el reloj inyectado para los tests) que emite `sleep-timer-ended`; el handler pausa
con un fundido corto de volumen. En Android debe seguir funcionando con la app en segundo plano (comprobarlo en
`test:e2e:android`).

## 6. Recientes sincronizados

**Qué falta:** `Recents` vive en `localStorage`, solo en ese equipo, mientras que listas y favoritos ya van por
el bucket.

**Propuesta:** `recents.js` en el backend sobre `shared.js` (`metadatos/recientes.json`, límite de entradas,
gana el `playedAt` más reciente), con `import()` de los de `localStorage` como se hizo con favoritos. Evento
`recents-changed`. Es casi copiar el camino de favoritos.

## 7. Sin cortes entre pistas y fundido

**Qué falta:** `AudioEngine` usa un solo `<audio>`; entre pista y pista hay un hueco (malo en discos en directo
o mezclas continuas).

**Propuesta:**
- Dos elementos `<audio>` alternos: el siguiente se precarga unos segundos antes del final.
- Opción "Fundido entre canciones" (0–8 s) en `Settings`.
- **Riesgos:** la salida de audio elegida (`setSinkId`) hay que aplicarla a los dos; en Android, la
  MediaSession y `PlaybackService` deben ver un único "reproductor". Por eso es **L**.

## 8. Escuchar sin conexión (Android)

**Propuesta:** "Descargar" en listas y favoritos: guarda los archivos en el almacenamiento de la app (Filesystem)
y `toTrack` devuelve la URL local si existe. Ajuste con el espacio usado y "Borrar descargas". Solo Android al
principio; en Electron el streaming desde S3 ya va bien en casa.

## 9. Ordenar y filtrar la biblioteca

**Propuesta:** en la vista de canciones, ordenar por título, artista, álbum, año o fecha de subida (ETag/
`LastModified` ya vienen del listado), y filtro rápido de texto. Todo dentro de `Catalog` (regla 6) y estado de
UI en la vista.

## 10. Borrar canciones del bucket

**Qué falta:** `storage.js` nunca borra (decisión de diseño): para quitar una canción hay que ir a la consola de S3.

**Propuesta:** "Eliminar del bucket" con doble confirmación (como borrar una lista), solo si las claves tienen
permiso de escritura; borra también su entrada en `metadatos/biblioteca.json` y la quita de listas y favoritos.
**Hay que decidirlo explícitamente** porque cambia la regla de "nunca borra" de `CLAUDE.md` y afecta a todos los
Pulse del bucket.

## 11. Vista de Artistas

**Qué pasa** (captura del 25/10/2026, escritorio):
- **Los nombres largos se salen de la tarjeta y se pisan con los de al lado** ("Farruko, Victor Cardenas, Dj
  Alberto" encima de "Franco "El Gorilla", Yandel"…). `.media-card__title` no recorta el texto y
  `.media-card--round` lo centra, así que desborda por los dos lados.
- **Cada combinación de artistas cuenta como un artista distinto**: `Catalog.artists()` agrupa por el texto
  entero de `track.artist`, así que "Farruko" y "Farruko, Victor Cardenas, Dj Alberto" salen por separado, casi
  todos con "1 canción", y la canción no aparece al abrir "Farruko".
- Casi ningún artista tiene imagen: se usa la carátula de una de sus canciones y, si no hay, el degradado.

**Propuesta:**
1. **CSS (S, se puede hacer ya):** título de `.media-card` en como mucho dos líneas con `line-clamp` y
   `overflow-wrap: anywhere`, y el nombre completo en `title` para verlo al pasar el ratón. Revisarlo también en
   álbumes y recientes, que usan la misma tarjeta.
2. **Separar artistas (M):** función pura en `lib/` que parte `artist` por `,`, `&`, ` y `, `feat.`/`ft.`/`x`,
   con cuidado de no romper nombres que los llevan ("Simon & Garfunkel", "Tyler, The Creator"): lista de
   excepciones y, si internet está activado, quedarse con lo que diga iTunes/Deezer. `Catalog.artists()` agrupa
   por cada artista y `collection({ type: 'artist' })` devuelve también las colaboraciones. El texto de la pista
   no cambia (se sigue viendo "Farruko, Victor Cardenas…").
3. **Foto del artista (opcional, M):** Deezer tiene `picture_xl` por artista sin clave; se guardaría como las
   carátulas (`metadatos/caratulas/`), respetando el interruptor "Datos de internet".

**Pruebas:** `tests/colleagues/Catalog.test.js` (agrupación con colaboraciones y excepciones), test del separador
en `tests/lib/` y captura del e2e de Artistas con nombres largos en `tests/e2e/fixtures.js`.

## 12. Carátulas que aparecen a poquitos (escritorio)

**Qué pasa:** al entrar faltan casi todas las imágenes de los artistas (y de álbumes y canciones); al cerrar y
volver a entrar hay algunas más, y así cada vez. Las canciones **llevan la carátula dentro del archivo**, así que
no depende de internet.

**Por qué pasa (lo que dice el código; falta confirmarlo con la app):**
- En Electron, cada carátula incrustada se sirve con `media://cover/<id>` y **se descarga del bucket en cada
  petición**: `readRemoteCover()` (`backend/library/remote.js`) baja el principio del archivo (≥ 512 KB) para
  sacar la imagen. Solo hay una caché **en memoria** de 64 entradas: no sobrevive al cierre.
- La cuadrícula de Artistas pide decenas de carátulas a la vez y **no hay límite de peticiones simultáneas**:
  decenas de descargas de medio mega contra S3 en paralelo. Las que tardan o fallan acaban en "sin carátula".
- **Un fallo se queda guardado como "no tiene carátula"** para toda la sesión: el `catch` de
  `readRemoteCover()` mete `null` en la caché, la respuesta es un 404 y `createCover()` quita la `<img>` sin
  reintentar. Aunque se repinte la vista, vuelve a salir el degradado.
- Las que sí cargan se responden con `Cache-Control: max-age=86400`, así que Chromium probablemente las guarda
  en su caché de disco. En el siguiente arranque esas salen al momento y se intenta con las demás. **Por eso
  cada vez hay más.**
- En Android no pasa igual: `src/android/covers.js` ya guarda las incrustadas como archivos en `covers/`
  (de una en una), aunque tampoco reintenta en la sesión lo que falló (`failed`).

**Cómo confirmarlo:** borrar la caché de Chromium en userData (`Cache/`), abrir Artistas y mirar en la consola
del main o en Red cuántas `media://cover/…` dan 404, y si con un límite de 4 a la vez salen todas.

**Propuesta:**
1. **Guardar en disco la carátula incrustada al sincronizar (la clave):** `readRemoteRecord()` ya descarga el
   principio del archivo para leer las etiquetas. Ahí mismo se saca la imagen y se guarda en
   `userData/covers/` (nombre por ruta + ETag, como `coverFileName()` de Android), **sin ninguna descarga
   extra**. El protocolo sirve el archivo local; solo si no está, va al bucket. Para la biblioteca que ya
   existe, una pasada en segundo plano rellena lo que falte, de pocas en pocas.
2. **Compartirla por el bucket (opcional):** subirla también a `metadatos/caratulas/`, así los otros Pulse y el
   móvil no tienen que leer cada archivo. Ojo con el espacio (una imagen por álbum si se agrupa por hash).
3. **Distinguir "no tiene" de "falló":** si la descarga falla, no se guarda en caché y se responde 503 (no 404);
   `createCover()` reintenta una vez pasados unos segundos antes de dejar el degradado. Lo mismo en el `failed`
   de Android.
4. **Límite de lecturas simultáneas de carátulas en el main** (p. ej. 4, como `CONCURRENCY` de `sync.js`), en
   cola por orden de petición, para no saturar S3 cuando se abre una cuadrícula grande.
5. **Miniaturas:** las incrustadas suelen ser de 1000–3000 px; en las tarjetas basta con ~300 px. Reducirla al
   guardarla (`nativeImage.resize` en el main) aligera la caché y el pintado.

**Pruebas:** `tests/backend/` (el registro trae la carátula para guardar; un fallo de lectura no queda en caché),
`tests/main/` (el protocolo sirve de `covers/` sin tocar el bucket; 503 si falla; límite de concurrencia con el
S3 falso lento) y e2e: con el S3 falso y varias canciones con ID3 e imagen, todas las tarjetas de Artistas
muestran la carátula al primer arranque.

---

## Cómo se cierra cada mejora

1. Rama propia y commits pequeños (`feat(ui): …`, `feat(backend): …`).
2. `npm test` y, si toca UI o main, `npm run test:e2e` revisando las capturas frente al diseño.
3. Si toca la UI móvil, el backend o `src/android/`: `npm run android:apk`, instalar y `npm run test:e2e:android`.
4. Actualizar `CLAUDE.md` si cambia una regla o una pieza de la estructura.
5. PR a `main`; release-please saca la versión menor al fusionar.
