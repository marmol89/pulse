# Pulse — reproductor de música (Electron + patrón Mediator)

Reproductor nativo para **Windows y Linux** en JavaScript puro (sin frameworks de UI). Diseño de referencia:
`app-musica-figma.svg` (móvil) y su adaptación a escritorio en `.claude/skills/iniciar-proyecto/reference/diseno.md`.
La skill `iniciar-proyecto` es la fuente de las reglas de abajo: tenla presente antes de tocar código.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca la app en desarrollo |
| `npm test` | Tests unitarios (`node:test`, Node ≥ 22) |
| `npm run test:e2e` | Prueba de humo de la app real (playwright-core): abre la ventana unos segundos, audio silenciado, capturas en `tests/e2e/output/` |
| `npm run icons` | Regenera `src/assets/icon.png` |
| `npm run dist:win` / `npm run dist:linux` | Instaladores en `dist/` (NSIS / AppImage + deb). Lento: solo cuando se pida. El `.deb`/AppImage, mejor desde Linux, WSL o CI |

Electron 45 descarga su binario la primera vez que se usa; para forzarlo: `node node_modules/electron/install.js`.

## Estructura

```
src/main/        proceso main (NO forma parte del mediator)
  main.js        ventana, instancia única, sin navegación, --lang=es
  protocol/      media://track|cover/<ruta>: rangos HTTP, solo rutas de la biblioteca (403 si no)
  library/       tracks.js (escaneo + metadatos), store.js (library.json en userData), importer.js
  ipc/library.js canales library:* (los usa el preload)
src/preload/preload.cjs   window.api (contextBridge, sandbox)
src/renderer/
  app.js         raíz de composición: crea colegas → PlayerMediator → app-ready
  core/          Mediator (solo enruta) y Colleague
  mediator/      PlayerMediator (solo compone), events.js, actions.js, handlers/ (uno por caso de uso)
  colleagues/    modelos (Catalog, Playlist, Favorites, Recents), servicios (AudioEngine,
                 LibraryService, MediaSessionBridge) y vistas (Router, HomeView, PlaylistView,
                 SearchView, NowPlayingView, ControlsView, ToastView, KeyboardShortcuts)
  ui/            piezas de UI sin estado de negocio (dom, icons, cover, format, trackList, transport)
  lib/           utilidades puras (storage, text)
  styles/        tokens.css (único sitio con valores), layout.css, components.css
tests/           unitarios por carpeta + helpers/ (fakeContext, WAV con ID3, FakeAudio) + e2e/
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

## Añadir una funcionalidad

1. Si hace falta, un colega nuevo en `colleagues/` que extienda `Colleague`, creado en `app.js`.
2. Sus eventos en `mediator/events.js`.
3. Un **módulo nuevo** en `mediator/handlers/` registrado con `.use()` en `PlayerMediator` (solo gana esa línea), con su test en `tests/handlers/`.

## Convenciones

- Todo en español: UI, documentación y commits.
- **Commits pequeños** (uno por pieza), estilo Conventional Commits (`feat(ui): …`, `fix(core): …`).
- CSS: colores, radios y tamaños de fuente solo con tokens de `tokens.css` (lo comprueba `tests/ui/styles.test.js`).
- Antes de dar algo por terminado: `npm test` y, si cambia la UI o el main, `npm run test:e2e` revisando las capturas frente al diseño.
