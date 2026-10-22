// Prepares the self-hosted assets of the experimental camera control (run by the web `predev`/`prebuild`):
//  1. downloads the MediaPipe gesture model into apps/web/public/models/ (verified, idempotent)
//  2. copies the MediaPipe WASM files into apps/web/public/mediapipe-wasm/
// Both targets are gitignored. At runtime nothing is requested from Google or a CDN.
/* global Buffer, URL, console, fetch, process */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
// SHA-256 of gesture_recognizer/float16/1 (8373440 bytes), computed from the official download.
const MODEL_SHA256 = '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482';

const webDir = new URL('../apps/web/', import.meta.url);
const modelDir = new URL('public/models/', webDir);
const modelFile = new URL('gesture_recognizer.task', modelDir);
const wasmTarget = new URL('public/mediapipe-wasm/', webDir);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function existingModelIsValid() {
  try {
    return sha256(await readFile(modelFile)) === MODEL_SHA256;
  } catch {
    return false;
  }
}

async function fetchModel() {
  if (await existingModelIsValid()) {
    console.log('[fetch-model] model present and verified, skipping download');
    return;
  }
  console.log(`[fetch-model] downloading ${MODEL_URL}`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== MODEL_SHA256) {
    throw new Error(`SHA-256 mismatch for the gesture model (expected ${MODEL_SHA256}, got ${actual})`);
  }
  await mkdir(modelDir, { recursive: true });
  // Write to a temp name first so an aborted run never leaves a half-written model behind.
  const partial = new URL('gesture_recognizer.task.part', modelDir);
  await writeFile(partial, buffer);
  await rename(partial, modelFile);
  console.log('[fetch-model] model saved and verified');
}

async function copyWasm() {
  // npm may hoist the package to the root or keep it in apps/web/node_modules: resolve it like the app does.
  const require = createRequire(new URL('package.json', webDir));
  const source = `${dirname(require.resolve('@mediapipe/tasks-vision'))}/wasm/`;
  await rm(wasmTarget, { recursive: true, force: true });
  await mkdir(wasmTarget, { recursive: true });
  await cp(source, fileURLToPath(wasmTarget), { recursive: true });
  console.log('[fetch-model] MediaPipe WASM copied to apps/web/public/mediapipe-wasm');
}

try {
  await copyWasm();
  await fetchModel();
} catch (error) {
  console.error(`[fetch-model] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
