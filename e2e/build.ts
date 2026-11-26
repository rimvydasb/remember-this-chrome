import { execFileSync } from 'node:child_process';
import { EXTENSION_DIR } from './paths';

/** Builds the extension once, into a folder that only the E2E tests use. */
export default function build() {
  execFileSync('npx', ['vite', 'build', '--outDir', EXTENSION_DIR, '--emptyOutDir'], { stdio: 'inherit' });
}
