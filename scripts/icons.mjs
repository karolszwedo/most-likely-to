// The game's icon as PNG files, drawn from its one source public/icons/icon.svg (home-screen-icon). Run by hand after
// a change of the icon (`npm run icons`) and commit the PNGs: the build and CI only serve them. The manifest, the
// <head> of every page (src/layouts/Layout.astro) and the link's card (LINK_PREVIEW_IMAGE in
// src/components/room/game-intro.ts) point at these files; tests/unit/home-screen-icon.test.ts checks them.
//
// Chrome draws the SVG on a canvas at each size (Playwright with the system's Chrome, as for the screenshots of the
// screens) and hands back its pixels; this script writes them as PNG itself. Google Play wants a 32-bit PNG with an
// alpha channel, and Chrome's own screenshot drops the channel when every pixel is opaque, so the PNG is always
// written as RGBA (colour type 6) here. No image library is needed.
/* global Image, document, btoa -- page.evaluate below runs in Chrome, not in Node */
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const SOURCE = new URL("../public/icons/icon.svg", import.meta.url);
const OUTPUTS = [
  { path: "public/favicon.png", size: 32 },
  { path: "public/apple-touch-icon.png", size: 180 },
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
];

// One PNG chunk: length, type, data and the CRC of type and data.
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// RGBA pixels (row after row, 4 bytes each) as a PNG: 8 bits per channel, colour type 6, no filter on any row.
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const svg = await readFile(SOURCE, "utf8");
// An SVG with a viewBox alone has no size of its own and Chrome will not decode it as an image, so each size sets it.
const sourceAt = (size) =>
  `data:image/svg+xml;base64,${Buffer.from(svg.replace("<svg ", `<svg width="${size}" height="${size}" `)).toString("base64")}`;
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  for (const { path, size } of OUTPUTS) {
    // The canvas draws the vector at the target size, so small files are sharp, not a scaled-down 512.
    const base64 = await page.evaluate(
      async ({ source, size }) => {
        const image = new Image(size, size);
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        let binary = "";
        for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return btoa(binary);
      },
      { source: sourceAt(size), size },
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, png(size, Buffer.from(base64, "base64")));
    console.log(`${path}: ${size}×${size}`);
  }
} finally {
  await browser.close();
}
