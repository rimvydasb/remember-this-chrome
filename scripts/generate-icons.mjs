// Generates the extension icons (public/icons/icon-<size>.png) without external tools.
// Design (Graphite): indigo tile with rounded corners, a white bookmark, the star cut out of it, and a soft
// shadow under the bookmark at 48 px and up. Keep in sync with src/app/ui/AppIcon.tsx.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = resolve(import.meta.dirname, '..', 'public', 'icons');
const SAMPLES = 4;

// Shapes in a 0..1 coordinate space (the 100-unit design of src/app/ui/AppIcon.tsx, divided by 100).
const TILE = [0x5b, 0x67, 0xe0]; // #5b67e0
const MARK = [255, 255, 255];

function insideRoundedSquare(x, y) {
  // Tile: x, y from 0.02 to 0.98, corner radius 0.24.
  const r = 0.24;
  const cx = Math.min(Math.max(x, 0.02 + r), 0.98 - r);
  const cy = Math.min(Math.max(y, 0.02 + r), 0.98 - r);
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

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Distance from a point to the polygon outline. */
function distanceToOutline(x, y, points) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    best = Math.min(best, distanceToSegment(x, y, points[j], points[i]));
  }
  return best;
}

/** Inside the polygon, or within `grow` of it: a polygon with a round-joined stroke of width 2 × grow. */
function insideGrown(x, y, points, grow) {
  return insidePolygon(x, y, points) || distanceToOutline(x, y, points) <= grow;
}

const BOOKMARK = [
  [0.31, 0.21],
  [0.69, 0.21],
  [0.69, 0.8],
  [0.5, 0.65],
  [0.31, 0.8],
];
// Five-pointed star centred in the bookmark's body.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 0.125 : 0.054;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return [0.5 + radius * Math.cos(angle), 0.42 + radius * Math.sin(angle)];
});

/** The bookmark is relatively smaller at small sizes, so the tile still reads as a tile. */
function markScale(size) {
  if (size >= 96) return 1;
  if (size >= 48) return 0.94;
  if (size >= 32) return 0.9;
  if (size >= 24) return 0.87;
  return 0.85;
}

/** RGBA (alpha 0..1) of the icon at a point, or null outside the tile. */
function pixelColor(x, y, size) {
  if (!insideRoundedSquare(x, y)) return null;
  const k = markScale(size);
  // Bookmark and star live in a group scaled around (0.5, 0.505).
  const gx = (px, py) => [(px - 0.5) / k + 0.5, (py - 0.505) / k + 0.505];
  const [mx, my] = gx(x, y);
  const grow = 0.04;
  if (insideGrown(mx, my, STAR, 0.0125)) return [...TILE, 1];
  if (insideGrown(mx, my, BOOKMARK, grow)) return [...MARK, 1];
  if (size >= 48) {
    // Soft shadow under the bookmark: 3 units down, about 5 units of blur.
    const [sx, sy] = gx(x, y - 0.03);
    const inside = insideGrown(sx, sy, BOOKMARK, grow);
    const distance = inside ? 0 : distanceToOutline(sx, sy, BOOKMARK) - grow;
    const shadow = 0.28 * Math.max(0, 1 - distance / (0.05 * k));
    if (shadow > 0) return [...TILE.map((c) => c * (1 - shadow)), 1];
  }
  return [...TILE, 1];
}

function render(size) {
  const data = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    data[row] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = pixelColor((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, size);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          covered++;
        }
      }
      const offset = row + 1 + px * 4;
      if (covered > 0) {
        data[offset] = Math.round(r / covered);
        data[offset + 1] = Math.round(g / covered);
        data[offset + 2] = Math.round(b / covered);
      }
      data[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
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
