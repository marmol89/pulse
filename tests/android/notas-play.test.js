import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { notesFor } from '../../scripts/notas-play.mjs';

const CHANGELOG = `# Changelog

## [0.3.0](https://github.com/marmol89/pulse/compare/v0.2.0...v0.3.0) (2026-10-24)


### Novedades

* **android:** App Bundle firmado (.aab) para Google Play ([#11](https://github.com/marmol89/pulse/issues/11)) ([5094987](https://github.com/marmol89/pulse/commit/5094987))
* añade el icono de la app ([54ee199](https://github.com/marmol89/pulse/commit/54ee199))

### Correcciones

* el appId es com.marmol89.pulse ([#6](https://github.com/marmol89/pulse/issues/6)) ([0503a02](https://github.com/marmol89/pulse/commit/0503a02))

## [0.2.0](https://github.com/marmol89/pulse/compare/v0.1.0...v0.2.0) (2026-10-24)

* versión anterior
`;

describe('notas de Google Play', () => {
  test('toma solo las entradas de esa versión, sin enlaces ni ámbitos', () => {
    assert.equal(notesFor(CHANGELOG, '0.3.0'), [
      '• App Bundle firmado (.aab) para Google Play',
      '• Añade el icono de la app',
      '• El appId es com.marmol89.pulse',
    ].join('\n'));
  });

  test('una versión que no está no da notas', () => {
    assert.equal(notesFor(CHANGELOG, '9.9.9'), '');
  });

  test('no pasa de los 500 caracteres de Play', () => {
    const long = `## [1.0.0](x)\n\n${Array.from({ length: 40 }, (_, i) => `* novedad número ${i} con texto`).join('\n')}\n`;
    assert.equal(notesFor(long, '1.0.0').length, 500);
  });
});
