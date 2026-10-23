/**
 * Genera src/assets/icon.png (512×512): cuadrado redondeado con el gradiente
 * primario → acento del diseño, un círculo decorativo como el de "Mix diario"
 * y el pulso del logo en blanco. electron-builder lo convierte en .ico para Windows.
 * Uso: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodePng, paint, diagonalGradient } from './lib/png.js';

const SIZE = 512;
const CORNER = 0.22;
const OUTPUT = fileURLToPath(new URL('../src/assets/icon.png', import.meta.url));

// Trazado del icono "pulse" de ui/icons.js (viewBox -12..12), escalado al icono.
const PULSE = [[-11, 0], [-6, 0], [-3, -7], [1, 7], [4, -3], [6, 0], [11, 0]];
const UNIT = 0.62 / 24;
const STROKE = 2.4 * UNIT;
const POINTS = PULSE.map(([x, y]) => [0.5 + x * UNIT, 0.5 + y * UNIT]);

const gradient = diagonalGradient('#7C5CFF', '#FF5CA8');

function insideRoundedSquare(u, v) {
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - CORNER), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - CORNER), 0);
  return dx * dx + dy * dy <= CORNER * CORNER;
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

function shader(u, v) {
  if (!insideRoundedSquare(u, v)) return [0, 0, 0, 0];
  if (onPulse(u, v)) return [255, 255, 255, 1];
  const color = gradient(u, v);
  // Círculo decorativo blanco al 8 %, como en la tarjeta destacada.
  const decor = Math.hypot(u - 0.86, v - 0.16) < 0.34 ? 0.08 : 0;
  return [...color.map((channel) => channel + (255 - channel) * decor), 1];
}

await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, encodePng(SIZE, SIZE, paint(SIZE, SIZE, shader, 4)));
console.log(`Icono generado en ${OUTPUT}`);
