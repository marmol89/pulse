import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatDuration, plural, collectionStats, greeting } from '../../src/renderer/ui/format.js';

describe('ui/format', () => {
  test('formatTime() como en el diseño (1:24, 3:32) y con horas si hace falta', () => {
    assert.equal(formatTime(84), '1:24');
    assert.equal(formatTime(212.9), '3:32');
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(3725), '1:02:05');
    assert.equal(formatTime(Number.NaN), '0:00');
    assert.equal(formatTime(-3), '0:00');
  });

  test('formatDuration() redondea a minutos', () => {
    assert.equal(formatDuration(5520), '1 h 32 min');
    assert.equal(formatDuration(2700), '45 min');
    assert.equal(formatDuration(3600), '1 h');
    assert.equal(formatDuration(0), '0 min');
  });

  test('plural() concuerda en número', () => {
    assert.equal(plural(1, 'canción', 'canciones'), '1 canción');
    assert.equal(plural(24, 'canción', 'canciones'), '24 canciones');
  });

  test('collectionStats() como en la pantalla Playlist', () => {
    const tracks = Array.from({ length: 24 }, () => ({ duration: 230 }));
    assert.equal(collectionStats(tracks), '24 canciones · 1 h 32 min');
    assert.equal(collectionStats([{ duration: 0 }]), '1 canción');
  });

  test('greeting() según la hora del día', () => {
    const at = (hour) => new Date(2026, 0, 1, hour);
    assert.equal(greeting(at(8)), 'Buenos días');
    assert.equal(greeting(at(15)), 'Buenas tardes');
    assert.equal(greeting(at(21)), 'Buenas noches');
    assert.equal(greeting(at(3)), 'Buenas noches');
  });
});
