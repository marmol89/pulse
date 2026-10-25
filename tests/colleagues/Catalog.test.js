import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Catalog, albumKey } from '../../src/renderer/colleagues/Catalog.js';
import { track } from '../helpers/tracks.js';

function catalogWith(...list) {
  const catalog = new Catalog();
  catalog.add(list);
  return catalog;
}

const neon = track('/m/neon.mp3', { title: 'Luces de Neón', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', trackNo: 2 });
const intro = track('/m/intro.mp3', { title: 'Intro', artist: 'Aurora Vega', album: 'Neón', genre: 'Pop latino', trackNo: 1 });
const ola = track('/m/ola.mp3', { title: 'Ola Azul', artist: 'Marea Sur', album: 'Mareas', genre: 'Lo-fi chill', cover: 'media://cover/ola' });
const selva = track('/m/selva.mp3', { title: 'Selva', artist: 'Kora', genre: 'Lo-fi chill' });
const atardecer = track('/m/atardecer.mp3', { title: 'Atardecer', artist: 'Los Prismas', genre: 'Pop latino' });

describe('Catalog', () => {
  test('add() cuenta solo las pistas nuevas y actualiza las existentes', () => {
    const catalog = new Catalog();
    assert.equal(catalog.add([neon, ola]), 2);
    assert.equal(catalog.add([{ ...neon, title: 'Editada' }, selva, null]), 1);
    assert.equal(catalog.size(), 3);
    assert.equal(catalog.get(neon.path).title, 'Editada');
  });

  test('remove() quita pistas y cuenta las que había', () => {
    const catalog = catalogWith(neon, ola);
    assert.equal(catalog.remove([neon.path, '/no/existe.mp3']), 1);
    assert.equal(catalog.get(neon.path), null);
    assert.equal(catalog.size(), 1);
  });

  test('byPaths() respeta el orden e ignora rutas desconocidas', () => {
    const catalog = catalogWith(neon, ola, selva);
    assert.deepEqual(
      catalog.byPaths([selva.path, '/no/existe.mp3', neon.path]).map((t) => t.path),
      [selva.path, neon.path],
    );
  });

  test('search() ignora tildes y mayúsculas y prioriza coincidencias en el título', () => {
    const catalog = catalogWith(neon, ola, selva, atardecer);
    assert.deepEqual(catalog.search('NEON').map((t) => t.title), ['Luces de Neón']);
    assert.deepEqual(catalog.search('aurora luces').map((t) => t.title), ['Luces de Neón']);
    assert.deepEqual(catalog.search('a').slice(0, 2).map((t) => t.title), ['Atardecer', 'Ola Azul']);
    assert.deepEqual(catalog.search('   '), []);
  });

  test('topGenres() devuelve los géneros más frecuentes', () => {
    const catalog = catalogWith(neon, intro, ola, selva, atardecer, track('/m/x.mp3'));
    assert.deepEqual(catalog.topGenres(1), [{ name: 'Pop latino', count: 3 }]);
    assert.deepEqual(catalog.topGenres(5).map((g) => g.name), ['Pop latino', 'Lo-fi chill']);
  });

  test('albums() agrupa por artista del álbum y usa una muestra con portada', () => {
    const catalog = catalogWith(neon, intro, ola, selva);
    const albums = catalog.albums();
    assert.deepEqual(albums.map((a) => [a.title, a.artist, a.count]), [
      ['Mareas', 'Marea Sur', 1],
      ['Neón', 'Aurora Vega', 2],
    ]);
    assert.equal(albums[0].sample, ola);
  });

  test('artists() cuenta las pistas de cada artista', () => {
    const catalog = catalogWith(neon, intro, ola);
    assert.deepEqual(catalog.artists().map((a) => [a.name, a.count]), [
      ['Aurora Vega', 2],
      ['Marea Sur', 1],
    ]);
  });

  test('artists() cuenta una colaboración para cada uno de sus artistas', () => {
    const solo = track('/m/solo.mp3', { title: 'Solo', artist: 'Farruko' });
    const juntos = track('/m/juntos.mp3', { title: 'Juntos', artist: 'Farruko, Victor Cardenas', cover: 'media://cover/juntos' });
    const catalog = catalogWith(solo, juntos);
    assert.deepEqual(catalog.artists().map((a) => [a.name, a.count]), [
      ['Farruko', 2],
      ['Victor Cardenas', 1],
    ]);
    assert.equal(catalog.artists()[0].sample, juntos, 'la muestra es una con carátula');
    assert.deepEqual(catalog.collection({ kind: 'artist', key: 'Farruko' }).tracks, [solo, juntos]);
    assert.deepEqual(catalog.collection({ kind: 'artist', key: 'Victor Cardenas' }).tracks, [juntos]);
  });

  test('las fotos de artista van a su tarjeta y a su colección (sin distinguir mayúsculas ni tildes)', () => {
    const catalog = catalogWith(neon, ola);
    assert.equal(catalog.setArtistPictures({ 'aurora vega': 'media://artist/a.jpg', Nadie: 'media://artist/n.jpg' }), true);
    assert.equal(catalog.setArtistPictures({ 'Aurora Vega': 'media://artist/a.jpg', 'Marea Sur': '' }), false, 'nada nuevo');
    assert.deepEqual(catalog.artists().map((a) => [a.name, a.picture]), [
      ['Aurora Vega', 'media://artist/a.jpg'],
      ['Marea Sur', null],
    ]);
    assert.equal(catalog.collection({ kind: 'artist', key: 'Aurora Vega' }).cover, 'media://artist/a.jpg');
    assert.equal(catalog.collection({ kind: 'artist', key: 'Marea Sur' }).cover, null);
  });

  test('collection() resuelve biblioteca, álbum (por número de pista), artista, género y búsqueda', () => {
    const catalog = catalogWith(neon, intro, ola, selva, atardecer);

    assert.equal(catalog.collection({ kind: 'library' }).tracks.length, 5);

    const album = catalog.collection({ kind: 'album', key: albumKey(neon) });
    assert.equal(album.title, 'Neón');
    assert.equal(album.byline, 'Aurora Vega');
    assert.deepEqual(album.tracks.map((t) => t.title), ['Intro', 'Luces de Neón']);

    assert.deepEqual(catalog.collection({ kind: 'artist', key: 'Kora' }).tracks, [selva]);
    assert.equal(catalog.collection({ kind: 'genre', key: 'Lo-fi chill' }).tracks.length, 2);
    assert.deepEqual(catalog.collection({ kind: 'search', key: 'selva' }).tracks, [selva]);
    assert.deepEqual(catalog.collection({ kind: 'desconocido' }).tracks, []);
  });

  test('la biblioteca se ordena: por defecto, las añadidas recientemente primero', () => {
    const dated = (item, addedAt, year = 0) => ({ ...item, addedAt, year });
    const catalog = catalogWith(dated(neon, 3, 2020), dated(intro, 3, 2020), dated(ola, 1, 2024), dated(selva, 5), atardecer);
    const titles = (sort) => catalog.collection({ kind: 'library', sort }).tracks.map((item) => item.title);

    assert.deepEqual(titles(), ['Selva', 'Intro', 'Luces de Neón', 'Ola Azul', 'Atardecer'], 'empate: por título; sin fecha, al final');
    assert.deepEqual(titles('desconocido'), titles());
    assert.deepEqual(titles('title'), ['Atardecer', 'Intro', 'Luces de Neón', 'Ola Azul', 'Selva']);
    assert.deepEqual(titles('artist'), ['Intro', 'Luces de Neón', 'Selva', 'Atardecer', 'Ola Azul'], 'en cada artista, por álbum y número');
    assert.deepEqual(titles('album'), ['Selva', 'Atardecer', 'Ola Azul', 'Intro', 'Luces de Neón'], 'sin álbum primero');
    assert.deepEqual(titles('year'), ['Ola Azul', 'Intro', 'Luces de Neón', 'Selva', 'Atardecer'], 'las más nuevas primero');
  });

  test('el filtro de la biblioteca busca todas las palabras sin cambiar el orden', () => {
    const catalog = catalogWith(neon, intro, ola, selva, atardecer);
    const titles = (filter) => catalog.collection({ kind: 'library', sort: 'title', filter }).tracks.map((item) => item.title);
    assert.deepEqual(titles('aurora'), ['Intro', 'Luces de Neón']);
    assert.deepEqual(titles('neon aurora'), ['Intro', 'Luces de Neón'], 'sin tildes y por álbum también');
    assert.deepEqual(titles('  '), titles(''));
    assert.deepEqual(titles('nada de esto'), []);
  });
});
