# Diseño "Pulse" → app de escritorio

Fuente de verdad visual: `app-musica-figma.svg` en la raíz del proyecto (exportado de Figma).
Léelo antes de generar la UI. Está pensado para móvil (390 × 844, tema oscuro); aquí se define cómo
se traduce a escritorio **sin perder la identidad visual**.

## 1. Tokens (`templates/src/renderer/styles/tokens.css` es la lista completa y manda)

Además de los de esta tabla, `tokens.css` define las transparencias del diseño (hover 4 %, fila activa 6 %,
círculos decorativos 8 %, progreso 20 %), las de las formas de las portadas generadas, espaciado, medidas,
sombras y duraciones.

| Token                | Valor                                 | Uso en el diseño                         |
|----------------------|---------------------------------------|------------------------------------------|
| `--color-bg`         | `#0E0E12`                             | fondo general, tab bar                   |
| `--color-surface`    | `#24242E`                             | chips, tarjetas de género, mini-player   |
| `--color-track`      | `#3A3A48`                             | fondo de barras de progreso              |
| `--color-primary`    | `#7C5CFF`                             | repetir activo, gradiente                |
| `--color-accent`     | `#FF5CA8`                             | corazón, pista activa, ecualizador       |
| `--color-success`    | `#3DDC97`                             | dispositivo de salida activo             |
| `--color-text`       | `#FFFFFF`                             | texto principal                          |
| `--color-text-2`     | `#9A9AAB`                             | texto secundario, iconos inactivos       |
| `--color-text-3`     | `#B8B8C8`                             | artista en "Reproduciendo", iconos acción|
| `--grad-accent`      | `#7C5CFF → #FF5CA8` (135°)            | chip activo, botón play, progreso        |
| `--grad-warm`        | `#FFB25C → #FF5CA8`                   | portadas generadas, avatar               |
| `--grad-cool`        | `#2EC5FF → #7C5CFF`                   | portadas generadas                       |
| `--grad-green`       | `#3DDC97 → #2EC5FF`                   | portadas generadas                       |
| `--grad-now-playing` | `#3B2A7A → #0E0E12` (vertical, 60 %)  | fondo de la vista Reproduciendo          |
| `--grad-playlist`    | `#7A2A55 → #0E0E12` (vertical) sobre 440 px de alto (≈ 50 % de la pantalla móvil) | fondo de la vista Playlist |

Radios: chips `17px` (píldora), tarjetas `24px`, portadas grandes `28px`, portadas medianas `16–20px`,
miniaturas `8–10px`, filas/mini-player `12–16px`.

Tipografía **Inter** (empaquetada en local con `@fontsource/inter`, nada de CDN):
título 30/800 · sección 20/700 · nombre de canción 15/600 · secundario 13/400 · etiquetas 11–12/600
con `letter-spacing` 1.2–1.5 en mayúsculas ("PARA TI", "REPRODUCIENDO DESDE").

## 2. Adaptación a escritorio (ventana mín. 960 × 600)

```
┌──────────────┬───────────────────────────────────────────────┐
│ Sidebar      │  Vista principal (scroll)                     │
│  ● Inicio    │   Inicio | Playlist | Buscar | Biblioteca     │
│  ○ Buscar    │                                               │
│  ○ Biblioteca│                                               │
│ ─ Tu música ─│                                               │
│  + carpeta   │                                               │
│  + archivos  │                                               │
├──────────────┴───────────────────────────────────────────────┤
│ Player bar  (mini-player ampliado a todo el ancho)           │
│ [portada] Título/Artista ♥ │ ⤨ ⏮ ⏯ ⏭ ↻  ──●──── 1:24/3:32 │ 🔊 ▭ │
└──────────────────────────────────────────────────────────────┘
```

- La **tab bar** inferior del móvil se convierte en **sidebar** vertical (mismos iconos y textos;
  activo en blanco y 600, inactivo `--color-text-2`). Se omiten la status bar y el *home indicator*.
- El **mini-player** pasa a ser la **player bar** fija abajo, con los controles completos de la pantalla
  02 en tamaño compacto y una línea de progreso con `--grad-accent`.
- **Reproduciendo** (pantalla 02) es una vista a pantalla completa, sobre la sidebar, que se abre al
  pulsar la portada de la player bar y se cierra con el chevron ↓ o `Esc`. En escritorio la portada va
  a la izquierda y la info + controles a la derecha si el ancho ≥ 1100px; si no, en columna como el móvil.
- **Playlist** (pantalla 03): cabecera con portada + título + "N canciones · duración" y botón play con
  gradiente; lista de filas de 60px. Fila activa: fondo blanco 6 %, título en `--color-accent` e icono
  de ecualizador animado en vez de la duración.
- **Inicio** (pantalla 01): saludo según la hora ("Buenos días/tardes/noches"), chips de filtro,
  tarjeta destacada, carrusel "Escuchado recientemente" y tarjetas de género. En escritorio las
  rejillas usan `auto-fill` en vez de 3 columnas fijas.

## 3. Qué significa cada elemento en un reproductor local

| Elemento del diseño          | Implementación                                                        |
|------------------------------|-----------------------------------------------------------------------|
| Tarjeta "Mix diario"         | "Mezcla aleatoria": reproduce toda la biblioteca en shuffle           |
| "Escuchado recientemente"    | Últimas pistas iniciadas (colega `Recents`, persistido)               |
| Tarjetas de género           | Géneros leídos de los metadatos (`common.genre`), los 4 más frecuentes |
| Chips Todo/Música/Podcasts/Radio | Se reinterpretan como **Todo · Álbumes · Artistas · Favoritos** (no hay podcasts ni radio en local) |
| Corazón ♥                    | Favoritos (colega `Favorites`, persistido)                            |
| "Altavoz de la sala"         | Selector de dispositivo de salida (`HTMLMediaElement.setSinkId`)      |
| Tarjeta "Letra"              | Letra embebida en los metadatos si existe; si no, se oculta           |
| Portadas de colores          | Si la pista no tiene carátula, se genera con uno de los 4 gradientes elegido por hash del álbum/título, con las formas decorativas del diseño (círculos/triángulo al 25 % de opacidad) |
| Compartir, ⋯, avatar/Perfil  | Fuera de alcance en v1: no se renderizan                              |

## 4. Iconos

Reutiliza los `path` del SVG como componentes SVG inline (`src/renderer/ui/icons.js`), con
`stroke="currentColor"`/`fill="currentColor"` para que hereden el color del estado.
