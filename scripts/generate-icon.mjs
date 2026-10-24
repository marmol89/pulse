/**
 * Genera los iconos de la app a partir del diseño: cuadrado redondeado con el
 * gradiente primario → acento, un círculo decorativo como el de "Mix diario"
 * y el pulso del logo en blanco.
 * - src/assets/icon.png (512×512): electron-builder lo convierte en .ico para Windows.
 * - android/app/src/main/res/mipmap-*: icono clásico, redondo y adaptativo
 *   (fondo con el gradiente + pulso en primer plano, que sirve también de monocromo).
 * Uso: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodePng, paint, diagonalGradient } from './lib/png.js';

const SIZE = 512;
const CORNER = 0.22;
const OUTPUT = new URL('../src/assets/icon.png', import.meta.url);
const ANDROID_RES = new URL('../android/app/src/main/res/', import.meta.url);
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// Icono adaptativo de Android: lienzo de 108 dp del que se ven los 72 dp centrales.
const ADAPTIVE = 108;
const VISIBLE = 72 / ADAPTIVE;
const INSET = (1 - VISIBLE) / 2;

// Trazado del icono "pulse" de ui/icons.js (viewBox -12..12), escalado al icono.
const PULSE = [[-11, 0], [-6, 0], [-3, -7], [1, 7], [4, -3], [6, 0], [11, 0]];
const UNIT = 0.62 / 24;
const STROKE = 2.4 * UNIT;
const POINTS = PULSE.map(([x, y]) => [0.5 + x * UNIT, 0.5 + y * UNIT]);

const TRANSPARENT = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 1];
const gradient = diagonalGradient('#7C5CFF', '#FF5CA8');
const clamp = (value) => Math.max(0, Math.min(1, value));

function insideRoundedSquare(u, v) {
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - CORNER), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - CORNER), 0);
  return dx * dx + dy * dy <= CORNER * CORNER;
}

function insideCircle(u, v) {
  return Math.hypot(u - 0.5, v - 0.5) <= 0.5;
}

function distanceToSegment(u, v, [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - (ax + t * dx), v - (ay + t * dy));
}

function onPulse(u, v) {
  for (let i = 1; i < POINTS.length; i += 1) {
    if (distanceToSegment(u, v, POINTS[i - 1], POINTS[i]) <= STROKE / 2) return true;
  }
  return false;
}

function background(u, v) {
  const color = gradient(clamp(u), clamp(v));
  // Círculo decorativo blanco al 8 %, como en la tarjeta destacada.
  const decor = Math.hypot(u - 0.86, v - 0.16) < 0.34 ? 0.08 : 0;
  return [...color.map((channel) => channel + (255 - channel) * decor), 1];
}

/** Icono completo recortado con `inside` (cuadrado redondeado o círculo). */
const icon = (inside) => (u, v) => {
  if (!inside(u, v)) return TRANSPARENT;
  return onPulse(u, v) ? WHITE : background(u, v);
};

/** Pasa un shader del icono (0..1 = zona visible) al lienzo adaptativo de 108 dp. */
const adaptive = (shader) => (u, v) => shader((u - INSET) / VISIBLE, (v - INSET) / VISIBLE);

const ANDROID_ICONS = [
  { name: 'ic_launcher', dp: 48, shader: icon(insideRoundedSquare) },
  { name: 'ic_launcher_round', dp: 48, shader: icon(insideCircle) },
  { name: 'ic_launcher_background', dp: ADAPTIVE, shader: adaptive(background) },
  { name: 'ic_launcher_foreground', dp: ADAPTIVE, shader: adaptive((u, v) => (onPulse(u, v) ? WHITE : TRANSPARENT)) },
];

async function writePng(url, size, shader) {
  await writeFile(url, encodePng(size, size, paint(size, size, shader, 4)));
}

await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true });
await writePng(OUTPUT, SIZE, icon(insideRoundedSquare));
console.log(`Icono generado en ${fileURLToPath(OUTPUT)}`);

for (const [density, scale] of Object.entries(DENSITIES)) {
  const folder = new URL(`mipmap-${density}/`, ANDROID_RES);
  await mkdir(folder, { recursive: true });
  for (const { name, dp, shader } of ANDROID_ICONS) {
    await writePng(new URL(`${name}.png`, folder), Math.round(dp * scale), shader);
  }
}
console.log(`Iconos de Android generados en ${fileURLToPath(ANDROID_RES)}mipmap-*`);
