import { normalize } from './text.js';

/**
 * Grupos cuyo nombre lleva un separador y no son colaboraciones.
 * "Tyler, The Creator" no hace falta: una parte que empieza por "The" se une a la anterior.
 */
const KEEP_TOGETHER = [
  'Simon & Garfunkel',
  'Earth, Wind & Fire',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Peter, Paul and Mary',
  'Hall & Oates',
  'Mumford & Sons',
  'Florence + The Machine',
  'Kool & The Gang',
  'Sly & The Family Stone',
  'Bob Marley & The Wailers',
  'Tom Petty & The Heartbreakers',
  'Echo & The Bunnymen',
  'Siouxsie & The Banshees',
  'Huey Lewis & The News',
  'Ike & Tina Turner',
  'Sam & Dave',
  'Brooks & Dunn',
  'Andy & Lucas',
];

// Comas, punto y coma, barras, " & ", " + ", " x " y las formas de "featuring".
const SEPARATOR = /\s*(?:[,;/]|\s&\s|\s\+\s|\sx\s|\s(?:feat\.?|ft\.?|featuring)\s)\s*/i;
// "Título (feat. Otro)" o "[ft. Otro]" dentro del campo artista.
const FEATURING = /\s*[([](?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]/gi;
const KEEP_PATTERNS = KEEP_TOGETHER.map((name) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

/**
 * Artistas de una pista: "Farruko, Victor Cardenas & Dj Alberto" → ["Farruko", "Victor Cardenas", "Dj Alberto"].
 * Respeta los grupos conocidos ("Simon & Garfunkel") y "Tyler, The Creator". Sin artista → [].
 */
export function splitArtists(artist) {
  let text = String(artist ?? '').trim();
  if (!text) return [];
  // Los grupos conocidos se cambian por una marca que ningún separador parte.
  const kept = [];
  for (const pattern of KEEP_PATTERNS) {
    text = text.replace(pattern, (name) => `\u0000${kept.push(name) - 1}\u0000`);
  }
  const featured = [];
  text = text.replace(FEATURING, (_match, names) => {
    featured.push(names);
    return '';
  });

  const names = [];
  for (const part of [text, ...featured].flatMap((piece) => piece.split(SEPARATOR))) {
    const name = part.trim().replace(/\u0000(\d+)\u0000/g, (_mark, index) => kept[Number(index)]);
    if (!name) continue;
    if (/^the\s/i.test(name) && names.length > 0) names[names.length - 1] += `, ${name}`;
    else names.push(name);
  }
  // Sin repetidos ("Farruko, farruko"): se queda la primera forma escrita.
  const unique = new Map();
  for (const name of names) if (!unique.has(normalize(name))) unique.set(normalize(name), name);
  return [...unique.values()];
}
