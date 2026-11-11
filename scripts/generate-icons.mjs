// Generates the extension icons (public/icons/icon-<size>.png) without external tools.
// Design: indigo-violet rounded square with a white bookmark that holds a "play" triangle.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = resolve(import.meta.dirname, '..', 'public', 'icons');
const SAMPLES = 4;

const FROM = [76, 110, 245]; // #4c6ef5
const TO = [132, 94, 247]; // #845ef7

// Shapes in a 0..1 coordinate space.
function insideRoundedSquare(x, y) {
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const BOOKMARK = [
  [0.3, 0.2],
  [0.7, 0.2],
  [0.7, 0.82],
  [0.5, 0.66],
  [0.3, 0.82],
];
const PLAY = [
  [0.44, 0.31],
  [0.6, 0.41],
  [0.44, 0.51],
];

function pixelColor(x, y) {
  if (!insideRoundedSquare(x, y)) return null;
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  const background = FROM.map((c, i) => c + (TO[i] - c) * t);
  if (insidePolygon(x, y, PLAY)) return background;
  if (insidePolygon(x, y, BOOKMARK)) return [255, 255, 255];
  return background;
}

function render(size) {
  const data = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    data[row] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = pixelColor((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a++;
        }
      }
      const offset = row + 1 + px * 4;
      if (a > 0) {
        data[offset] = Math.round(r / a);
        data[offset + 1] = Math.round(g / a);
        data[offset + 2] = Math.round(b / a);
      }
      data[offset + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return encodePng(size, size, data);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typeAndBody = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndBody));
  return Buffer.concat([length, typeAndBody, crc]);
}

function encodePng(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(resolve(OUT_DIR, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}
