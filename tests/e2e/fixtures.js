/** Canciones de prueba de los e2e (escritorio y Android): WAV generados con etiquetas, carátulas y letra. */
import { createWav } from '../helpers/audio.js';
import { encodePng, paint, diagonalGradient } from '../../scripts/lib/png.js';

function coverPng(from, to) {
  const gradient = diagonalGradient(from, to);
  return encodePng(240, 240, paint(240, 240, (u, v) => [...gradient(u, v), 1]));
}

const NEON = coverPng('#7C5CFF', '#FF5CA8');
const MAREAS = coverPng('#2EC5FF', '#7C5CFF');
export const FIXTURES = [
  ['Aurora Vega/Neón/01 Intro.wav', { title: 'Intro', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '1', cover: NEON }],
  [
    'Aurora Vega/Neón/02 Luces de Neón.wav',
    { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', track: '2', cover: NEON, lyrics: 'Brillan las luces\nde la ciudad\ny tú conmigo' },
  ],
  ['Marea Sur/Mareas/Ola Azul.wav', { title: 'Ola Azul', artist: 'Marea Sur', album: 'Mareas', genre: 'Lo-fi chill', cover: MAREAS }],
  ['Los Prismas/Atardecer.wav', { title: 'Atardecer', artist: 'Los Prismas', album: 'Atardecer', genre: 'Pop latino' }],
  ['Kora/Selva.wav', { title: 'Selva', artist: 'Kora', album: 'Verde', genre: 'Lo-fi chill' }],
  ['Sueltas/pista sin etiquetas.wav', null],
];

/** Bucket "musica" con los WAV (10 s: caben en los 512 KB que se leen para las etiquetas). */
export function bucketObjects() {
  return Object.fromEntries(FIXTURES.map(([key, tags], index) => [key, createWav({ seconds: 10, frequency: 330 + index * 55, tags })]));
}
