/**
 * Notas de la versión para Google Play: las entradas de CHANGELOG.md de la versión de package.json,
 * sin enlaces ni ámbitos, en dist/whatsnew/whatsnew-es-ES (Play admite como mucho 500 caracteres).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MAX = 500;
const root = fileURLToPath(new URL('../', import.meta.url));

export function notesFor(changelog, version) {
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) return '';
  const end = changelog.indexOf('\n## ', start + 1);
  const notes = changelog.slice(start, end < 0 ? undefined : end).split('\n')
    .filter((line) => line.startsWith('* '))
    .map((line) => line.slice(2)
      .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '')  // ([#11](…)) y ([5094987](…))
      .replace(/^\*\*[^*]+:\*\*\s*/, '')           // **android:**
      .trim())
    .map((line) => `• ${line[0].toUpperCase()}${line.slice(1)}`)
    .join('\n');
  return notes.length > MAX ? `${notes.slice(0, MAX - 1)}…` : notes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const notes = notesFor(await readFile(path.join(root, 'CHANGELOG.md'), 'utf8'), version)
    || `Versión ${version}.`;
  const dir = path.join(root, 'dist/whatsnew');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'whatsnew-es-ES'), notes);
  console.log(notes);
}
