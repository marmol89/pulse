---
name: iniciar-proyecto
description: Inicializa (scaffold) el reproductor de música de escritorio nativo para Windows y Linux hecho con JavaScript (Electron) y estructurado con el patrón de diseño Mediator. Úsala cuando el usuario pida iniciar, crear, arrancar o montar el proyecto del reproductor, generar su estructura base, o rehacer el esqueleto desde cero.
---

# Iniciar proyecto: reproductor de música con patrón Mediator

Objetivo: dejar en la carpeta actual un proyecto **Electron + JavaScript puro** que arranca con `npm start`,
reproduce archivos de audio locales y empaqueta para **Windows (NSIS)** y **Linux (AppImage + deb)**,
con toda la lógica de UI coordinada por un **Mediator**.

## Paso 0 — Comprobaciones

1. Verifica `node -v` (>= 20) y `npm -v`.
2. Lista la carpeta. Si ya existe `package.json` o `src/`, **no sobrescribas**: pregunta al usuario si quiere
   rehacer el esqueleto o solo completar lo que falte.
3. Si no es repositorio git, ejecuta `git init` y crea `.gitignore` (`node_modules/`, `dist/`, `out/`, `*.log`).

## Paso 1 — package.json y dependencias

Copia `templates/package.json` a la raíz (ajusta `name`/`author` si el usuario lo indica) y ejecuta:

```bash
npm install --save-dev electron electron-builder
npm install music-metadata @fontsource/inter
```

- `music-metadata` (ESM) se usa **solo en el proceso main** para leer título/artista/álbum/género/
  letra/duración/carátula.
- `@fontsource/inter` empaqueta la tipografía del diseño en local (la app funciona sin conexión).
- No añadas frameworks de UI (React, Vue…) salvo que el usuario lo pida: la UI es HTML + ES modules.

## Paso 2 — Estructura de carpetas

```
src/
  main/
    main.js                 # ventana, ciclo de vida de la app
    ipc/library.js          # diálogos de archivos/carpetas + lectura de metadatos
  preload/
    preload.cjs             # contextBridge -> window.api (debe ser .cjs)
  renderer/
    index.html              # sidebar + <main> de vistas + overlay Reproduciendo + player bar
    app.js                  # composición: crea mediator + colleagues y los conecta
    styles/
      tokens.css            # tokens del diseño (plantilla)
      layout.css            # sidebar, main, player bar, overlay
      components.css        # chips, tarjetas, filas, botones, barras de progreso
    ui/
      icons.js              # iconos SVG inline extraídos de app-musica-figma.svg
      cover.js              # portada real o generada con gradiente (función pura)
      format.js             # mm:ss, "24 canciones · 1 h 32 min", saludo según la hora
    core/
      Mediator.js           # clase base abstracta
      Colleague.js          # clase base de los colegas
    mediator/
      PlayerMediator.js     # solo compone: colegas + .use(handlers). SIN lógica
      events.js             # constante EVENTS (catálogo único de eventos)
      actions.js            # acciones compartidas entre handlers (p. ej. loadTrack)
      handlers/             # un módulo por caso de uso, pequeño y cohesivo
        playback.js         # play/pausa, seek, volumen, dispositivo de salida, sync UI
        navigation.js       # siguiente, anterior, selección, fin de pista
        modes.js            # shuffle, repeat, "Mix diario"
        library.js          # abrir archivos / carpetas
        views.js            # navegación de vistas, overlay, filtros, búsqueda
        favorites.js        # corazón ♥
        recents.js          # "Escuchado recientemente"
        errors.js           # errores de reproducción
    colleagues/
      # modelos y servicios (sin DOM)
      AudioEngine.js        # envuelve HTMLAudioElement
      Playlist.js           # pistas, índice, shuffle, repeat, búsqueda, géneros
      Favorites.js          # Set de rutas, persistido en localStorage
      Recents.js            # últimas 12 pistas, persistido en localStorage
      LibraryService.js     # habla con window.api (IPC)
      # vistas (diseño app-musica-figma.svg)
      Router.js             # sidebar + cambio de vista + overlay
      HomeView.js           # pantalla 01 · Inicio
      NowPlayingView.js     # pantalla 02 · Reproduciendo (overlay)
      PlaylistView.js       # pantalla 03 · Playlist
      SearchView.js         # Buscar
      ControlsView.js       # player bar (mini-player de escritorio)
      KeyboardShortcuts.js  # espacio, flechas, Esc, media keys
tests/
  Mediator.test.js
  handlers/*.test.js        # uno por módulo de handlers, con ctx falso
```

Copia tal cual los archivos de `templates/` (core, mediator, main, preload, styles/tokens.css). El
resto genéralo siguiendo las reglas de abajo y `reference/diseno.md`.

## Paso 3 — Reglas del patrón Mediator (obligatorias)

1. **Los colegas nunca se conocen entre sí.** Ningún archivo de `colleagues/` importa otro colega.
   Solo reciben el mediator en el constructor (a través de `Colleague`).
2. **Los colegas solo hacen dos cosas**: exponer métodos propios (`play()`, `render(tracks)`, `setIndex(i)`…)
   y avisar al mediator con `this.notify('evento', payload)`.
3. **Toda decisión de coordinación vive en la capa `mediator/`**, repartida en módulos de
   `handlers/` (p. ej. "cuando la pista termina, pide la siguiente a Playlist; si hay, cárgala en
   AudioEngine y actualiza NowPlayingView y PlaylistView" está en `handlers/navigation.js`).
4. Nombres de eventos en `kebab-case` y declarados en la constante `EVENTS` de `mediator/events.js`.
   No uses strings sueltos fuera de esa constante.
5. Las vistas no guardan estado de negocio; `Playlist` es la fuente de verdad del orden/índice
   y `AudioEngine` del tiempo/volumen.
6. El proceso main **no** forma parte del mediator: es un servicio remoto al que solo accede
   `LibraryService` mediante `window.api`.
7. Seguridad Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
   CSP en `index.html`. Los archivos locales se sirven con un protocolo propio `media://`
   registrado en main (ver `templates/src/main/main.js`), nunca con `file://` desde el renderer.

## Paso 3b — Evitar que el mediator sea un "God Object" (obligatorio)

El riesgo clásico del patrón es que el mediator acumule toda la lógica y se vuelva enorme. Para evitarlo:

1. **`Mediator` (core) solo enruta**: mapa `evento → handlers[]`, con `on()`, `use(módulo)` y `notify()`.
   Nunca contiene reglas del reproductor.
2. **`PlayerMediator` solo compone**: recibe colegas, crea el `context` congelado y hace
   `.use(playback).use(navigation)…`. Si alguien quiere añadir un `if` o un `switch` aquí, está mal:
   va a un módulo de `handlers/`.
3. **Un módulo de handlers por caso de uso**, exportando `{ [EVENTS.X](ctx, payload, sender) {…} }`.
   Límite orientativo: **~80 líneas por módulo**; si se supera o mezcla dos temas, se divide.
4. **Una funcionalidad nueva = un módulo nuevo** (p. ej. `handlers/equalizer.js`, `handlers/scrobbling.js`)
   registrado con `.use()`. No se engordan módulos existentes con temas ajenos. Varios módulos pueden
   escuchar el mismo evento (`on` admite varios handlers).
5. **Los handlers no guardan estado** y solo coordinan **dos o más colegas**. La lógica que afecta a un
   único colega va dentro de ese colega (el algoritmo de shuffle/repeat en `Playlist`, el formato de
   tiempo en la vista, etc.).
6. Coordinación repetida entre handlers (cargar pista + actualizar vistas) → función en `actions.js`,
   nunca copiada.
7. **No es un event bus**: los colegas no se suscriben a eventos ni se escuchan entre sí; solo
   `notify()` hacia el mediator.
8. Cada módulo de handlers se testea por separado con un `ctx` falso, sin instanciar el mediator.

Eventos mínimos y dónde se manejan:

| Emisor                          | Evento                        | Módulo       | Reacción                                                  |
|---------------------------------|-------------------------------|--------------|-----------------------------------------------------------|
| Controls / NowPlaying           | `play-toggle`                 | `playback`   | si no hay pista cargada, carga la actual; si no, alterna  |
| Controls / NowPlaying           | `seek`, `volume-change`       | `playback`   | `audio.seek()` / `audio.setVolume()`                      |
| NowPlaying                      | `output-device-change`        | `playback`   | `audio.setOutputDevice()` ("Altavoz de la sala")          |
| AudioEngine                     | `time-update`, `state-change` | `playback`   | sincroniza player bar, Reproduciendo y fila activa        |
| Controls / NowPlaying           | `next` / `previous`           | `navigation` | mueve índice en Playlist y carga la pista                 |
| PlaylistView / Home / Search    | `track-selected`              | `navigation` | `playlist.setIndex(i)` y carga/reproduce                  |
| AudioEngine                     | `ended`                       | `navigation` | `playlist.nextOnEnded()` o parar                          |
| Controls / NowPlaying           | `toggle-shuffle`, `cycle-repeat` | `modes`   | cambia modo en Playlist y refleja el icono                |
| HomeView (tarjeta Mix)          | `play-mix`                    | `modes`      | shuffle de toda la biblioteca y reproduce                 |
| Router / PlaylistView           | `open-files` / `open-folder`  | `library`    | `library.pick…()` → `playlist.add()` → render + Inicio    |
| Router (sidebar)                | `navigate`                    | `views`      | `router.show(view)`                                       |
| Controls (portada) / NowPlaying (chevron, Esc) | `open-now-playing` / `close-now-playing` | `views` | abre/cierra el overlay      |
| HomeView (chips)                | `filter-change`               | `views`      | filtra Todo/Álbumes/Artistas/Favoritos                    |
| SearchView                      | `search`                      | `views`      | `search.showResults(playlist.search(q))`                  |
| Controls / NowPlaying / Playlist| `toggle-favorite`             | `favorites`  | `favorites.toggle()` y actualiza los corazones            |
| AudioEngine                     | `track-started`               | `recents`    | `recents.add()` y refresca Inicio                         |
| AudioEngine                     | `error`                       | `errors`     | muestra aviso y salta a la siguiente                      |
| KeyboardShortcuts               | mismos que Controls + Esc     | —            | emite los mismos eventos; no hay lógica duplicada         |

### Contrato de métodos que usan los handlers de `templates/.../mediator/`

Los colegas generados **deben** exponer exactamente estos métodos:

Modelos y servicios:

- **AudioEngine**: `load(url, autoplay)`, `toggle()`, `hasTrack()`, `currentTime()`, `seek(s)`,
  `setVolume(0..1)`, `setOutputDevice(id)`. Emite `time-update {current, duration}`, `ended`,
  `state-change {playing}`, `track-started` (primer `playing` tras un `load`), `error {message}`.
- **Playlist**: `add(tracks)`, `tracks()`, `index()`, `current()`, `next()`, `previous()`, `setIndex(i)`,
  `nextOnEnded()`, `toggleShuffle()` → bool, `cycleRepeat()` → `'off'|'all'|'one'`, `shuffleAll()` → bool,
  `search(q)`, `topGenres(n)`. Los que mueven el índice devuelven la pista o `null`. No emite eventos.
- **Favorites**: `has(path)`, `toggle(path)` → bool, `list()`. No emite eventos.
- **Recents**: `add(track)`, `list()`. No emite eventos.
- **LibraryService**: `pickFiles()`, `pickFolder()` → `Promise<Track[]>` (llama a `window.api`).

Vistas:

- **Router**: `show(view)` (`'home'|'search'|'library'|'playlist'`), `openOverlay(name)`, `closeOverlay()`.
  Emite `navigate`, `open-files`, `open-folder`.
- **HomeView**: `render({ recents, genres })`, `setFilter(filter, tracks)`.
- **NowPlayingView**: `show(track, isFavorite)`, `setTime(c, d)`, `setPlaying(bool)`, `setFavorite(path, bool)`,
  `setOutputDevice(id)`, `showError(msg)`.
- **PlaylistView**: `render(tracks, index)`, `highlight(index)`, `setPlaying(bool)`, `setFavorite(path, bool)`.
- **SearchView**: `showResults(tracks)`.
- **ControlsView** (player bar): `setPlaying(bool)`, `setProgress(c, d)`, `setShuffle(bool)`,
  `setRepeat(mode)`, `setFavorite(path, bool)`.

`Track = { path, url, title, artist, album, genre, lyrics, duration, cover }`
(lo construye `src/main/ipc/library.js`).

CSP recomendada en `index.html`:
`default-src 'self'; img-src 'self' data:; media-src media:; style-src 'self'; font-src 'self'; script-src 'self'`.

## Paso 4 — UI según el diseño `app-musica-figma.svg`

1. **Lee `app-musica-figma.svg` (raíz del proyecto) y `reference/diseno.md`** antes de escribir la UI.
   El diseño es para móvil; `reference/diseno.md` define cómo adaptarlo a escritorio (sidebar en lugar
   de tab bar, player bar en lugar de mini-player, Reproduciendo como overlay).
2. Usa **solo los tokens** de `styles/tokens.css`: ningún color, radio ni tamaño de fuente escrito a mano
   en `layout.css`/`components.css`.
3. Copia los iconos del SVG a `ui/icons.js` (no uses librerías de iconos).
4. Implementa las tres pantallas: **Inicio**, **Reproduciendo** y **Playlist**, más **Buscar**, con los
   estados del diseño: pista activa en `--color-accent` con ecualizador animado, corazón relleno en
   favoritos, repetir activo en `--color-primary`, chip activo con `--grad-accent`.
5. Elementos del diseño sin equivalente local (Podcasts, Radio, Perfil, Compartir) **no se
   renderizan**; consulta la tabla de reinterpretaciones de `reference/diseno.md`.
6. Las vistas solo pintan y emiten eventos: nada de lógica de negocio dentro de ellas (Paso 3).

## Paso 5 — Tests y verificación

1. Crea tests con `node:test` + `node:assert` usando colegas falsos (objetos con métodos espía):
   - `tests/handlers/<módulo>.test.js` por cada módulo de handlers, llamando al handler con un `ctx`
     falso. Mínimo: `ended` avanza a la siguiente, `track-selected` carga la pista correcta,
     `play-toggle` sin pista cargada carga la actual.
   - `tests/Mediator.test.js`: `use()` registra, `notify()` ejecuta varios handlers del mismo evento
     en orden, y un evento sin handler solo avisa.
2. Ejecuta `npm test` y corrige hasta que pase.
3. Ejecuta `npm start` en segundo plano unos segundos para confirmar que la ventana arranca sin errores
   en consola; ciérralo después. Si es posible, haz una captura y compárala con `app-musica-figma.svg`
   (colores, tipografía, radios, estados).
4. **No** ejecutes `npm run dist` salvo que el usuario lo pida (es lento). Explica que
   `npm run dist:win` y `npm run dist:linux` generan los instaladores en `dist/`
   (para el `.deb`/AppImage desde Windows se recomienda compilar en Linux o WSL/CI).

## Paso 6 — Cierre

- Crea `CLAUDE.md` breve con: comandos (`start`, `test`, `dist:*`), la estructura y las reglas de los
  Pasos 3 y 3b, para que futuras sesiones respeten el patrón y no engorden el mediator.
- Resume al usuario qué se creó y cómo añadir una funcionalidad:
  1) si hace falta, un colega en `colleagues/` que extienda `Colleague` y se registre en `app.js`;
  2) sus eventos en `mediator/events.js`;
  3) un **módulo nuevo** en `mediator/handlers/` registrado con `.use()` en `PlayerMediator`,
     con su test. `PlayerMediator` solo gana una línea `.use(...)`.
