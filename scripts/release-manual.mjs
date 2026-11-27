// Packages the built extension (dist/) into release/<name>-<version>.zip
// for manual upload to the Chrome Web Store. Run via `npm run release:manual`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found. Run the build first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const { name } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const zipPath = resolve(releaseDir, `${name}-${version}.zip`);

mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });

// Zip the CONTENTS of dist/ so manifest.json sits at the zip root.
execFileSync('zip', ['-r', '-X', zipPath, '.', '-x', '*.DS_Store'], { cwd: dist, stdio: 'inherit' });

console.log(`\nRelease package created: ${zipPath}`);
