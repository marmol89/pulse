/**
 * Compila el APK de Android (debug): www/ → `cap sync android` → Gradle → dist/Pulse-X.Y.Z-debug.apk.
 * Necesita JDK 21 (JAVA_HOME) y el SDK de Android (ANDROID_HOME). Uso: npm run android:apk
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';

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

run('node', ['scripts/build-android.mjs']);
run('npx', ['cap', 'sync', 'android']);
const android = path.join(root, 'android');
// En Windows va por la shell (cmd), que necesita las comillas si la ruta tiene espacios.
run(windows ? `"${path.join(android, 'gradlew.bat')}"` : path.join(android, 'gradlew'),['assembleDebug', '--console=plain'], android);

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = `Pulse-${version}-debug.apk`;
await mkdir(path.join(root, 'dist'), { recursive: true });
await copyFile(path.join(root, 'android/app/build/outputs/apk/debug', name), path.join(root, 'dist', name));
console.log(`APK listo: dist/${name}`);
