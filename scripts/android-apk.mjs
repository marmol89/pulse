/**
 * Compila el APK de Android: www/ → `cap sync android` → Gradle → dist/.
 * - `npm run android:apk`: debug (dist/Pulse-X.Y.Z-debug.apk), el que usa el e2e.
 * - `npm run android:release`: firmado (dist/Pulse-X.Y.Z.apk) con la keystore de PULSE_KEYSTORE,
 *   PULSE_KEYSTORE_PASSWORD, PULSE_KEY_ALIAS y PULSE_KEY_PASSWORD.
 * Necesita JDK 21 (JAVA_HOME) y el SDK de Android (ANDROID_HOME).
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const release = process.argv.includes('--release');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: windows });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const name of ['JAVA_HOME', 'ANDROID_HOME']) {
  if (!process.env[name] || !existsSync(process.env[name])) {
    console.error(`Falta ${name}: instala el JDK 21 y el SDK de Android (ver CLAUDE.md, "Android").`);
    process.exit(1);
  }
}
// Sin keystore, Gradle sacaría un APK de release sin firmar que Android no instala.
if (release) {
  const missing = ['PULSE_KEYSTORE', 'PULSE_KEYSTORE_PASSWORD', 'PULSE_KEY_ALIAS', 'PULSE_KEY_PASSWORD']
    .filter((name) => !process.env[name]);
  if (missing.length || !existsSync(process.env.PULSE_KEYSTORE)) {
    console.error(`Para firmar faltan: ${missing.length ? missing.join(', ') : 'el archivo de PULSE_KEYSTORE'}.`);
    process.exit(1);
  }
}

run('node', ['scripts/build-android.mjs']);
run('npx', ['cap', 'sync', 'android']);
const android = path.join(root, 'android');
const variant = release ? 'release' : 'debug';
// En Windows va por la shell (cmd), que necesita las comillas si la ruta tiene espacios.
run(windows ? `"${path.join(android, 'gradlew.bat')}"` : path.join(android, 'gradlew'),
  [release ? 'assembleRelease' : 'assembleDebug', '--console=plain'], android);

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = `Pulse-${version}${release ? '' : '-debug'}.apk`;
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(path.join(root, 'android/app/build/outputs/apk', variant, name), path.join(root, 'dist', name));
console.log(`APK listo: dist/${name}`);
