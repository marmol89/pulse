---
name: revisar-interfaz
description: Comprueba que la interfaz de Pulse se ve bien (escritorio y móvil) sacando capturas de la app real y revisándolas una a una. Úsala SIEMPRE que se toque la interfaz (src/renderer/: vistas, ui/, estilos, index.html; o el diseño móvil y src/android/), antes de dar el cambio por terminado, y cuando el usuario pida revisar cómo se ve una pantalla o diga que algo "queda mal".
---

# Revisar la interfaz

Que los tests pasen **no** significa que se vea bien: un botón de más deja un título en «S..», una fila de
botones se sale de la pantalla en el móvil o un texto queda debajo de otro elemento, y ningún test lo detecta.
Por eso, **cada cambio de la interfaz se mira en capturas** antes de darlo por terminado.

## Cuándo

- Cualquier cambio en `src/renderer/` que se vea: `colleagues/*View.js`, `ui/`, `styles/`, `index.html`.
- Cambios en `src/android/` o en las reglas `@media (max-width: 720px)` de `layout.css`/`components.css`.
- Cuando el usuario diga que algo se ve mal: primero capturas para verlo, luego arreglarlo, luego capturas otra vez.

## Cómo

1. **Escritorio**: `npm run test:e2e` y revisar las capturas de `tests/e2e/output/` (las que no empiezan por `android-`).
2. **Móvil, rápido** (sin emulador): `node .claude/skills/revisar-interfaz/capturas-movil.mjs`. Abre la app real a
   412×915 contra el S3 falso, recorre todas las pantallas (con una lista de nombre largo a propósito) y deja las
   capturas en `tests/e2e/output/movil/`. Falla si alguna pantalla tiene scroll horizontal.
   Si el cambio afecta a una pantalla o estado que el script no recorre, añádelo al script.
3. **Móvil, de verdad** (si cambia la UI móvil, el backend o `src/android/`, como pide CLAUDE.md): `npm run android:apk`,
   emulador con ventana (`emulator -avd pulse -no-boot-anim -audio none -no-snapshot-save`), `adb install -r` del APK y
   `npm run test:e2e:android`; revisar las `android-*.png`. El WebView no es Chromium de escritorio: hay cosas que
   solo se ven aquí (barras de scroll, `:hover` que no existe, tamaños del sistema).
4. **Mirar cada captura** con la herramienta Read, una a una, comparando con el diseño (`app-musica-figma.svg` y
   `.claude/skills/iniciar-proyecto/reference/diseno.md`). No vale con que el script termine sin errores.
5. Si algo se ve mal, arreglarlo y **repetir las capturas** de esa pantalla hasta que esté bien.
6. Al terminar, decirle al usuario qué pantallas se han revisado y qué se ha corregido.

## Qué buscar en cada captura

- **Textos cortados** («S..», «Luces de…» con sitio de sobra): algo ocupa espacio que no debería, aunque sea invisible (`opacity: 0` ocupa sitio).
- **Cosas que se salen** de la pantalla o que obligan a hacer scroll horizontal; botones que pasan a dos líneas.
- **Solapes**: textos debajo de botones, avisos tapando controles, paneles mezclados con lo de detrás.
- **Demasiados botones juntos en el móvil**: en una fila o cabecera estrecha, un solo «⋯» con las opciones
  (`ui/menu.js`) en lugar de varios iconos. Lo que en escritorio se ve al pasar el ratón, en el móvil se ve
  siempre (`@media (hover: none)`), así que hay que contar con ello.
- **Chips y filas de botones** que bajan a otra línea: mejor una fila que se desliza.
- **Coherencia**: mismos tamaños, radios y colores que el resto (tokens de `tokens.css`), botones redondos de
  verdad, iconos alineados.
- **Estados**: vacío (lista sin canciones), con nombres largos, pista activa (ecualizador), menús y diálogos abiertos.
- **Textos de ayuda** que hablen de botones que ya no se ven en esa pantalla.

## Reglas

- Las capturas van a `tests/e2e/output/` (ignorado por git): nunca al repo.
- Nunca contra el S3 real ni con «Datos de internet» activado: el script y los e2e ya lo evitan.
- Si se cambia un selector que usan `tests/e2e/smoke.mjs`, `tests/e2e/android.mjs` o el script de esta skill, se actualizan en el mismo cambio.
