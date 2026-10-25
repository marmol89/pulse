import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  formatDuration,
  plural,
  collectionStats,
  greeting,
  formatDeviceLabel,
  formatClock,
  formatTrackNumber,
  formatDataSource,
  trackDetails,
} from '../../src/renderer/ui/format.js';

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

  test('formatClock() da la hora con dos cifras', () => {
    assert.equal(formatClock(new Date(2026, 9, 25, 9, 5).getTime()), '09:05');
    assert.equal(formatClock(new Date(2026, 9, 25, 23, 40).getTime()), '23:40');
  });

  test('formatDeviceLabel() quita ids USB y traduce el dispositivo predeterminado', () => {
    assert.equal(
      formatDeviceLabel({ id: 'default', label: 'Default - Altavoces (PRO X Wireless Gaming Headset) (046d:0aba)' }),
      'Predeterminado · Altavoces (PRO X Wireless Gaming Headset)',
    );
    assert.equal(formatDeviceLabel({ id: 'default', label: 'Default' }), 'Predeterminado del sistema');
    assert.equal(formatDeviceLabel({ id: 'x', label: 'MSI MP275 (NVIDIA High Definition Audio)' }), 'MSI MP275 (NVIDIA High Definition Audio)');
    assert.equal(formatDeviceLabel({ id: 'y', label: '' }, 2), 'Salida de audio 3');
  });

  test('formatTrackNumber() y formatDataSource()', () => {
    assert.equal(formatTrackNumber(9, 15), '9 de 15');
    assert.equal(formatTrackNumber(9, 0), '9');
    assert.equal(formatTrackNumber(0, 15), '');
    assert.equal(formatDataSource(null), 'Del archivo');
    assert.equal(formatDataSource({ status: 'not-found' }), 'Del archivo');
    assert.equal(formatDataSource({ status: 'found', source: 'iTunes', lyricsSource: 'LRCLIB' }), 'Del archivo y de iTunes · letra de LRCLIB');
  });

  test('trackDetails() da las filas de "Información" con valor, en orden', () => {
    const despacito = {
      artist: 'Luis Fonsi & Daddy Yankee',
      albumArtist: 'Luis Fonsi',
      album: 'VIDA',
      year: 2017,
      genre: 'Pop en español',
      trackNo: 9,
      trackCount: 15,
      duration: 229.4,
      online: { status: 'found', source: 'iTunes' },
    };
    assert.deepEqual(trackDetails(despacito), [
      ['Álbum', 'VIDA'],
      ['Artista del álbum', 'Luis Fonsi'],
      ['Año', '2017'],
      ['Género', 'Pop en español'],
      ['Pista', '9 de 15'],
      ['Duración', '3:49'],
      ['Datos', 'Del archivo y de iTunes'],
    ]);
    assert.deepEqual(trackDetails({ artist: 'Kora', albumArtist: 'Kora', album: '', year: 0, genre: '', trackNo: 0, duration: 0 }), [['Datos', 'Del archivo']]);
  });

  test('greeting() según la hora del día', () => {
    const at = (hour) => new Date(2026, 0, 1, hour);
    assert.equal(greeting(at(8)), 'Buenos días');
    assert.equal(greeting(at(15)), 'Buenas tardes');
    assert.equal(greeting(at(21)), 'Buenas noches');
    assert.equal(greeting(at(3)), 'Buenas noches');
  });
});
