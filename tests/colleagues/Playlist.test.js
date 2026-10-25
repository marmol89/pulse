import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Playlist } from '../../src/renderer/colleagues/Playlist.js';
import { tracks } from '../helpers/tracks.js';

const paths = (list) => list.map((track) => track?.path ?? null);

/** Azar determinista: siempre elige el primer elemento (invierte el orden con Fisher–Yates). */
const alwaysFirst = () => 0;

describe('Playlist', () => {
  test('una cola vacía no tiene pista actual ni siguiente', () => {
    const playlist = new Playlist();
    assert.equal(playlist.current(), null);
    assert.equal(playlist.next(), null);
    assert.equal(playlist.previous(), null);
    assert.equal(playlist.index(), -1);
    assert.equal(playlist.setQueue([]), null);
  });

  test('setQueue() empieza por la primera pista o por la indicada', () => {
    const playlist = new Playlist();
    assert.equal(playlist.setQueue(tracks('a', 'b', 'c')).path, 'a');
    assert.equal(playlist.setQueue(tracks('a', 'b', 'c'), 'b').path, 'b');
    assert.equal(playlist.index(), 1);
    assert.equal(playlist.setQueue(tracks('a', 'b'), 'no-existe').path, 'a');
  });

  test('next() y previous() avanzan en orden y se detienen en los extremos sin repetir', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c'));
    assert.deepEqual(paths([playlist.next(), playlist.next(), playlist.next()]), ['b', 'c', null]);
    assert.equal(playlist.current().path, 'c');
    assert.deepEqual(paths([playlist.previous(), playlist.previous(), playlist.previous()]), ['b', 'a', null]);
  });

  test('snapshot() y restore() vuelven a la misma cola, orden, posición y modos', () => {
    const original = new Playlist({ random: alwaysFirst });
    original.setQueue(tracks('a', 'b', 'c', 'd'), 'b');
    original.setShuffle(true);
    original.next();
    original.cycleRepeat();
    const byPath = new Map(tracks('a', 'b', 'c', 'd').map((track) => [track.path, track]));

    const restored = new Playlist();
    assert.equal(restored.restore(original.snapshot(), (path) => byPath.get(path)).path, original.current().path);
    assert.deepEqual(restored.snapshot(), original.snapshot());
    assert.equal(restored.isShuffle(), true);
    assert.equal(restored.repeatMode(), 'all');
  });

  test('restore() quita las pistas que ya no están y sigue por la siguiente', () => {
    const original = new Playlist();
    original.setQueue(tracks('a', 'b', 'c'), 'b');
    const byPath = new Map(tracks('a', 'c').map((track) => [track.path, track]));
    const restored = new Playlist();
    assert.equal(restored.restore(original.snapshot(), (path) => byPath.get(path)).path, 'c');
    assert.deepEqual(paths(restored.tracks()), ['a', 'c']);
    assert.equal(new Playlist().restore(original.snapshot(), () => null), null);
  });

  test('restore() ignora un orden roto y usa el original', () => {
    const byPath = new Map(tracks('a', 'b').map((track) => [track.path, track]));
    const restored = new Playlist();
    restored.restore({ paths: ['a', 'b'], order: [0, 0], position: 1, shuffle: true, repeat: 'raro' }, (path) => byPath.get(path));
    assert.deepEqual(restored.snapshot(), { paths: ['a', 'b'], order: [0, 1], position: 1, shuffle: false, repeat: 'off' });
  });

  test('playNext() mete las pistas justo detrás de la actual y enqueue() al final, sin repetirlas', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c'), 'a');
    assert.equal(playlist.playNext(tracks('x', 'y')), 2);
    assert.deepEqual(paths(playlist.ordered()), ['a', 'x', 'y', 'b', 'c']);
    assert.equal(playlist.enqueue(tracks('b', 'z')), 2);
    assert.deepEqual(paths(playlist.ordered()), ['a', 'x', 'y', 'c', 'b', 'z'], 'b se mueve al final, no se repite');
    assert.equal(playlist.playNext(tracks('a')), 0, 'la que suena no se mueve');
    assert.equal(playlist.current().path, 'a');
    assert.equal(playlist.next().path, 'x');
  });

  test('en aleatorio, lo añadido a mano no se baraja', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setQueue(tracks('a', 'b', 'c', 'd'), 'a');
    playlist.setShuffle(true);
    const before = paths(playlist.ordered());
    playlist.enqueue(tracks('z'));
    playlist.playNext(tracks('x'));
    assert.deepEqual(paths(playlist.ordered()), [before[0], 'x', ...before.slice(1), 'z']);
  });

  test('con la cola vacía, lo añadido pasa a ser la actual', () => {
    const playlist = new Playlist();
    playlist.enqueue(tracks('a', 'b'));
    assert.equal(playlist.current().path, 'a');
  });

  test('move() cambia el orden de reproducción y la actual sigue siendo la misma', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c', 'd'), 'b');
    assert.equal(playlist.move('d', 0), true);
    assert.deepEqual(paths(playlist.ordered()), ['d', 'a', 'b', 'c']);
    assert.equal(playlist.current().path, 'b');
    playlist.move('b', 99);
    assert.deepEqual(paths(playlist.ordered()), ['d', 'a', 'c', 'b']);
    assert.equal(playlist.next(), null, 'la actual ya es la última');
    assert.equal(playlist.move('no-existe', 0), false);
  });

  test('jumpTo() salta a una pista de la cola sin cambiar el orden', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setQueue(tracks('a', 'b', 'c'), 'a');
    playlist.setShuffle(true);
    const order = paths(playlist.ordered());
    assert.equal(playlist.jumpTo(order[2]).path, order[2]);
    assert.deepEqual(paths(playlist.ordered()), order);
    assert.equal(playlist.jumpTo('no-existe'), null);
  });

  test('cycleRepeat() recorre off → all → one → off', () => {
    const playlist = new Playlist();
    assert.equal(playlist.repeatMode(), 'off');
    assert.deepEqual([playlist.cycleRepeat(), playlist.cycleRepeat(), playlist.cycleRepeat()], ['all', 'one', 'off']);
  });

  test('con repetir todo, la cola da la vuelta en ambos sentidos', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b'), 'b');
    playlist.cycleRepeat();
    assert.equal(playlist.next().path, 'a');
    assert.equal(playlist.previous().path, 'b');
  });

  test('nextOnEnded() repite la misma pista con repetir una y avanza en otro caso', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b'));
    assert.equal(playlist.nextOnEnded().path, 'b');
    assert.equal(playlist.nextOnEnded(), null);
    playlist.cycleRepeat();
    playlist.cycleRepeat();
    assert.equal(playlist.nextOnEnded().path, 'b');
  });

  test('al activar el aleatorio la pista actual sigue sonando y el resto se baraja', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setQueue(tracks('a', 'b', 'c', 'd'), 'b');

    assert.equal(playlist.toggleShuffle(), true);

    assert.equal(playlist.current().path, 'b');
    assert.deepEqual(paths([playlist.next(), playlist.next(), playlist.next()]), ['c', 'd', 'a']);
  });

  test('al desactivar el aleatorio se vuelve al orden original desde la pista actual', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setQueue(tracks('a', 'b', 'c', 'd'));
    playlist.setShuffle(true);
    playlist.next();
    const current = playlist.current().path;

    assert.equal(playlist.toggleShuffle(), false);

    assert.equal(playlist.current().path, current);
    assert.equal(playlist.index(), ['a', 'b', 'c', 'd'].indexOf(current));
  });

  test('setQueue() con aleatorio activo empieza por la pista elegida', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setShuffle(true);
    assert.equal(playlist.setQueue(tracks('a', 'b', 'c'), 'c').path, 'c');
    assert.equal(playlist.size(), 3);
    const visited = new Set(['c', playlist.next().path, playlist.next().path]);
    assert.equal(visited.size, 3);
  });

  test('replace() actualiza una pista de la cola sin cambiar el orden ni la actual', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c'), 'b');
    const updated = { ...tracks('b')[0], album: 'VIDA' };

    assert.equal(playlist.replace(updated), true);

    assert.equal(playlist.current(), updated);
    assert.deepEqual(paths(playlist.tracks()), ['a', 'b', 'c']);
    assert.equal(playlist.replace(tracks('z')[0]), false);
  });

  test('remove() quita pistas sin cambiar el orden del resto ni la actual', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c', 'd'), 'c');

    assert.equal(playlist.remove(['a', 'd', 'no-esta']), false);

    assert.equal(playlist.current().path, 'c');
    assert.deepEqual(paths(playlist.tracks()), ['b', 'c']);
    assert.equal(playlist.previous().path, 'b');
  });

  test('remove() de la actual hace actual la siguiente', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b', 'c'), 'b');
    assert.equal(playlist.remove(['b']), true);
    assert.equal(playlist.current().path, 'c');
    assert.equal(playlist.previous().path, 'a');
  });

  test('remove() de la actual cuando era la última deja la cola sin pista actual', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b'), 'b');
    assert.equal(playlist.remove(['b']), true);
    assert.equal(playlist.current(), null);
    assert.equal(playlist.size(), 1);

    assert.equal(playlist.remove(['a']), false, 'ya no había actual');
    assert.equal(playlist.size(), 0);
  });

  test('remove() con aleatorio mantiene el orden barajado', () => {
    const playlist = new Playlist({ random: alwaysFirst });
    playlist.setQueue(tracks('a', 'b', 'c', 'd'), 'b');
    playlist.toggleShuffle(); // b, c, d, a

    playlist.remove(['c']);

    assert.equal(playlist.current().path, 'b');
    assert.deepEqual(paths([playlist.next(), playlist.next()]), ['d', 'a']);
  });

  test('tracks() devuelve una copia en el orden original', () => {
    const playlist = new Playlist();
    playlist.setQueue(tracks('a', 'b'));
    playlist.tracks().pop();
    assert.equal(playlist.size(), 2);
  });
});
