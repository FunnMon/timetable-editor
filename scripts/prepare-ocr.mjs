import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(project, 'public/ocr/runtime');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const worker = resolve(dirname(require.resolve('tesseract.js/package.json')), 'dist/worker.min.js');
await copyFile(worker, resolve(out, 'worker.min.js'));
await copyFile(resolve(dirname(worker), '../LICENSE.md'), resolve(out, 'LICENSE-tesseract.js'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.wasm(\.js)?$/.test(name)) await copyFile(resolve(core, name), resolve(out, name));
}
await copyFile(resolve(core, 'LICENSE'), resolve(out, 'LICENSE-tesseract-core'));
console.log('Local OCR runtime prepared.');
