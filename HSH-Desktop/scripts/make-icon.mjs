// Generates build/icon.ico offline (no image tools needed): a 32-bit
// uncompressed- BMP ICO with 256/128/64/48/32/16px entries — a white egg mark
// on deep green with an amber underline. Deterministic output.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "build", "icon.ico");

function draw(size) {
  // BGRA pixels, bottom-up rows.
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = a;
  };
  // Deep-green rounded backdrop.
  const rad = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x, rad), size - 1 - rad);
      const cy = Math.min(Math.max(y, rad), size - 1 - rad);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) set(x, y, 0x14, 0x2e, 0x22);
    }
  }
  // White egg (ellipse, slightly narrower at top).
  const ex = size / 2, ey = size * 0.44, rx = size * 0.20, ry = size * 0.27;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - ex) / rx, ny = (y - ey) / ry;
      const pinch = y < ey ? 0.86 : 1.0;
      if (nx * nx / (pinch * pinch) + ny * ny <= 1) set(x, y, 0xf2, 0xf5, 0xf1);
    }
  }
  // Amber underline bar.
  const bh = Math.max(2, Math.round(size * 0.045));
  const by = Math.round(size * 0.76);
  for (let y = by; y < by + bh; y++) {
    for (let x = Math.round(size * 0.28); x < Math.round(size * 0.72); x++) set(x, y, 0xe0, 0xa8, 0x3c);
  }
  return { size, px };
}

function bmpEntry({ size, px }) {
  const rowBytes = size * 4;
  const imgSize = rowBytes * size;
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size); // all-opaque AND mask
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height = image + mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(imgSize, 20);
  // Flip rows bottom-up.
  const flipped = Buffer.alloc(imgSize);
  for (let y = 0; y < size; y++) {
    px.copy(flipped, (size - 1 - y) * rowBytes, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([header, flipped, mask]);
}

const sizes = [256, 128, 64, 48, 32, 16];
const entries = sizes.map((s) => bmpEntry(draw(s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = 6 + 16 * entries.length;
const dir = [];
for (const e of entries) {
  const d = Buffer.alloc(16);
  d[0] = 0; d[1] = 0; // patched below (0 means 256)
  d[2] = 0; d[3] = 0;
  d.writeUInt16LE(1, 4);
  d.writeUInt16LE(32, 6);
  d.writeUInt32LE(e.length - 40, 8);
  d.writeUInt32LE(offset, 12);
  offset += e.length;
  dir.push(d);
}
// Patch width/height bytes from known sizes.
sizes.forEach((s, i) => {
  dir[i][0] = s >= 256 ? 0 : s;
  dir[i][1] = s >= 256 ? 0 : s;
});
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, ...dir, ...entries]));
console.log(`[icon] wrote ${OUT} (${sizes.length} entries)`);
