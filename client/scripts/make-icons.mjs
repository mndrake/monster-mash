/**
 * Generates the PWA icons (192px and 512px) into public/icons/.
 *
 * We have no image tools in this environment, so this script encodes simple
 * PNGs by hand using Node's built-in zlib. It draws a little round "monster"
 * token: a colored circle with two eyes on a dark background. Re-run with:
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// --- tiny PNG encoder -------------------------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels /* Uint8Array RGBA */) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // bytes 10-12 default to 0 (compression, filter, interlace)

  // Raw image data: each row is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[rowStart + 1 + i] = v;
    });
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- draw the icon ----------------------------------------------------------

function drawIcon(size) {
  const px = new Uint8Array(size * 4 * size);
  const bg = [16, 16, 26]; // #10101a
  const body = [91, 108, 255]; // #5b6cff
  const eye = [16, 16, 26];

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34; // monster body radius
  const eyeR = size * 0.06;
  const eyeDX = size * 0.12;
  const eyeDY = size * 0.05;

  const set = (x, y, [rr, gg, bb]) => {
    const i = (y * size + x) * 4;
    px[i] = rr;
    px[i + 1] = gg;
    px[i + 2] = bb;
    px[i + 3] = 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inBody = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const inLeftEye = (x - (cx - eyeDX)) ** 2 + (y - (cy - eyeDY)) ** 2 <= eyeR * eyeR;
      const inRightEye = (x - (cx + eyeDX)) ** 2 + (y - (cy - eyeDY)) ** 2 <= eyeR * eyeR;

      if (inLeftEye || inRightEye) set(x, y, eye);
      else if (inBody) set(x, y, body);
      else set(x, y, bg);
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const png = encodePng(size, drawIcon(size));
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
