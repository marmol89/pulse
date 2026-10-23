import { deflateSync } from 'node:zlib';

/**
 * Codificador PNG mínimo (RGBA de 8 bits) sin dependencias.
 * Lo usan el script del icono y los tests para generar carátulas.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** @param {Uint8Array} rgba píxeles RGBA fila a fila (width * height * 4) */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "None"
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, sin entrelazado
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Pinta una imagen evaluando `shader(u, v)` → [r, g, b, a] (u, v en 0..1),
 * con `samples`² muestras por píxel para suavizar bordes.
 */
export function paint(width, height, shader, samples = 1) {
  const rgba = new Uint8Array(width * height * 4);
  const weight = 1 / (samples * samples);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [r, g, b, a] = shader((x + (sx + 0.5) / samples) / width, (y + (sy + 0.5) / samples) / height);
          acc[0] += r * a;
          acc[1] += g * a;
          acc[2] += b * a;
          acc[3] += a;
        }
      }
      const offset = (y * width + x) * 4;
      const alpha = acc[3] * weight;
      rgba[offset] = alpha ? Math.round(acc[0] / acc[3]) : 0;
      rgba[offset + 1] = alpha ? Math.round(acc[1] / acc[3]) : 0;
      rgba[offset + 2] = alpha ? Math.round(acc[2] / acc[3]) : 0;
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }
  return rgba;
}

/** "#7C5CFF" → [124, 92, 255] */
export function hex(color) {
  const value = parseInt(color.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Gradiente diagonal (135°) entre dos colores, como los del diseño. */
export function diagonalGradient(from, to) {
  const [a, b] = [hex(from), hex(to)];
  return (u, v) => {
    const t = (u + v) / 2;
    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
  };
}
