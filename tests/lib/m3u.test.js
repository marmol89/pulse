import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toM3U, parseM3U, matchEntries, trackKey } from '../../src/renderer/lib/m3u.js';

const track = (path, title, artist, duration = 200) => ({ path, title, artist, duration });
const library = [
  track('s3://musica/Disco/01.mp3', 'Ola Azul', 'Marea'),
  track('s3://musica/Otro/01.mp3', 'Luz', 'Faro'),
  track('s3://musica/Canción Ñ.flac', 'Ñandú', 'Pampa', NaN),
];

describe('lib/m3u', () => {
  test('la clave quita el esquema y el bucket', () => {
    assert.equal(trackKey('s3://musica/Disco/01.mp3'), 'Disco/01.mp3');
    assert.equal(trackKey('local://carpetas/C:/Música/a.mp3'), 'C:/Música/a.mp3');
  });

  test('exporta #EXTM3U con #EXTINF y la ruta de cada canción', () => {
    assert.equal(
      toM3U(library),
      '#EXTM3U\n#EXTINF:200,Marea - Ola Azul\nDisco/01.mp3\n#EXTINF:200,Faro - Luz\nOtro/01.mp3\n#EXTINF:-1,Pampa - Ñandú\nCanción Ñ.flac\n',
    );
  });

  test('lee BOM, comentarios, líneas en blanco y finales de línea de Windows', () => {
    const entries = parseM3U('\uFEFF#EXTM3U\r\n\r\n# comentario\r\n#EXTINF:200,Marea - Ola Azul\r\nDisco/01.mp3\r\nsuelta.mp3\r\n');
    assert.deepEqual(entries, [
      { location: 'Disco/01.mp3', label: 'Marea - Ola Azul' },
      { location: 'suelta.mp3', label: '' },
    ]);
  });

  test('lo exportado se vuelve a importar entero y en orden', () => {
    const { paths, missing } = matchEntries(parseM3U(toM3U([...library].reverse())), library);
    assert.deepEqual(paths, library.map((t) => t.path).reverse());
    assert.deepEqual(missing, []);
  });

  test('rutas absolutas, de Windows, file:// y sin tildes encuentran la canción por el final de la ruta', () => {
    const entries = parseM3U(['C:\\Users\\ana\\Music\\Disco\\01.mp3', '/home/ana/musica/Otro/01.mp3', 'file:///D:/Mus/Cancion%20N.flac'].join('\n'));
    assert.deepEqual(matchEntries(entries, library).paths, library.map((t) => t.path));
  });

  test('un nombre de archivo que tienen dos discos no vale: se busca por "Artista - Título"', () => {
    const entries = parseM3U('#EXTINF:1,Faro - Luz\n01.mp3\n01.mp3');
    assert.deepEqual(matchEntries(entries, library), { paths: ['s3://musica/Otro/01.mp3'], missing: ['01.mp3'] });
  });

  test('lo que no está en la biblioteca va a missing y las repetidas se añaden una vez', () => {
    const entries = parseM3U('#EXTINF:1,Nadie - Nada\nno/existe.mp3\nDisco/01.mp3\nDisco/01.mp3');
    assert.deepEqual(matchEntries(entries, library), { paths: ['s3://musica/Disco/01.mp3'], missing: ['Nadie - Nada'] });
  });
});
