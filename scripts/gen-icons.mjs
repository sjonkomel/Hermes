#!/usr/bin/env node
// Genereert PWA-iconen (PNG) in public/ — puur Node, geen dependencies.
// Wordt automatisch gedraaid vóór build/dev (npm scripts prebuild/predev).
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

mkdirSync("public", { recursive: true });

const BG = [15, 23, 42];    // #0f172a slate-900 (zelfde als theme_color)
const FG = [255, 255, 255];

// ---- primitieven op het 512-ontwerpvlak ----
const inRect = (x, y, x0, y0, x1, y1, r = 0) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function carPixel(x, y) {
  // carrosserie
  if (inRect(x, y, 76, 240, 436, 344, 28)) return true;
  // cabine (trapezium)
  if (y >= 176 && y <= 240) {
    const t = (y - 176) / 64;
    const xl = 160 + (200 - 160) * (1 - t);
    const xr = 352 - (352 - 312) * (1 - t);
    if (x >= xl && x <= xr) return true;
  }
  // wielen (wit) met donkere naaf
  const wheel = (cx) => inCircle(x, y, cx, 344, 44) && !inCircle(x, y, cx, 344, 22);
  if (wheel(156) || wheel(356)) return true;
  return false;
}

function windowPixel(x, y) {
  // donkere raampjes in de cabine
  return inRect(x, y, 204, 186, 248, 230, 10) || inRect(x, y, 264, 186, 308, 230, 10);
}

function render(size, { fullBleed = false, scale = 1 } = {}) {
  const SS = 3; // supersampling voor anti-aliasing
  const rows = [];
  const c = size / 2;
  for (let py = 0; py < size; py++) {
    const row = [];
    for (let px = 0; px < size; px++) {
      let bgHits = 0, fgHits = 0, winHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ox = px + (sx + 0.5) / SS;
          const oy = py + (sy + 0.5) / SS;
          // ontwerpcoördinaat (512-vlak), geschaald rond het centrum
          const dx = c + (ox - c) / scale;
          const dy = c + (oy - c) / scale;
          // achtergrond: volle breedte (fullBleed) of afgeronde hoeken
          const bg = fullBleed || inRect(dx, dy, 0, 0, 512, 512, 96);
          if (!bg) continue;
          bgHits++;
          if (carPixel(dx, dy)) {
            if (windowPixel(dx, dy)) winHits++; else fgHits++;
          }
        }
      }
      const n = SS * SS;
      if (bgHits === 0) { row.push(0, 0, 0, 0); continue; }
      const blend = (fgCount, base) => {
        const a = fgCount / bgHits;
        return Math.round(base[3] !== undefined ? base[3] : base * a + BG[0] * (1 - a));
      };
      const f = fgHits / bgHits, w = winHits / bgHits;
      const r = Math.round(FG[0] * f + BG[0] * (1 - f - w));
      const g = Math.round(FG[1] * f + BG[1] * (1 - f - w));
      const b = Math.round(FG[2] * f + BG[2] * (1 - f - w));
      row.push(r, g, b, 255);
    }
    rows.push(row);
  }
  return rows;
}

function writePNG(path, size, rows) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (const row of rows) {
    raw[o++] = 0; // filter none
    for (const v of row) raw[o++] = v;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`${path}: ${png.length} bytes`);
}

writePNG("public/icon-192.png", 192, render(192));
writePNG("public/icon-512.png", 512, render(512));
writePNG("public/icon-maskable-512.png", 512, render(512, { fullBleed: true, scale: 0.78 }));
writePNG("public/apple-touch-icon.png", 180, render(180, { fullBleed: true, scale: 0.9 }));
console.log("iconen gegenereerd in public/");
