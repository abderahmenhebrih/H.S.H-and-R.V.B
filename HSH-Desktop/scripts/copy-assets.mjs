// Copies compiled main-process output + setup page next to the electron dist.
// (tsc emits dist-electron/*.js; setup.html ships alongside for loadFile.)
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "electron", "setup.html");
const dst = path.join(here, "..", "dist-electron", "setup.html");
if (!existsSync(path.join(here, "..", "dist-electron", "main.js"))) {
  throw new Error('dist-electron/main.js missing — "tsc" must run before copy-assets.');
}
copyFileSync(src, dst);
console.log(`[assets] setup.html → ${dst}`);
