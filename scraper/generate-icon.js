// Generates icon-192.png and icon-512.png for HEARD PWA
// Design: dark background, soundwave bars (purple), "HD" text (H white, D purple)
// Run: node generate-icon.js

import sharp from 'sharp';
import path  from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'icons');

function buildSvg(size) {
  const s = size;
  const cx = s / 2;

  // 5 bars — heights as fraction of size
  const barW    = s * 0.07;
  const gap     = s * 0.04;
  const totalW  = 5 * barW + 4 * gap;
  const startX  = cx - totalW / 2;
  const centerY = s * 0.40;

  const heights = [s * 0.14, s * 0.26, s * 0.38, s * 0.26, s * 0.14];
  const opacities = [0.55, 0.75, 1, 0.75, 0.55];

  const bars = heights.map((h, i) => {
    const x = startX + i * (barW + gap);
    const y = centerY - h / 2;
    const r = barW / 2;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${r.toFixed(1)}" fill="#9b5df5" opacity="${opacities[i]}"/>`;
  }).join('\n  ');

  const fontSize  = s * 0.30;
  const textY     = s * 0.82;
  // "H" and "D" side by side, centered
  // estimate char width ~0.62 * fontSize each, total ~1.24 * fontSize
  const totalTW   = fontSize * 1.24;
  const hX        = cx - totalTW / 2;
  const dX        = hX + fontSize * 0.62;

  const cornerR   = s * 0.16;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${cornerR.toFixed(1)}" fill="#0a0a10"/>
  ${bars}
  <text x="${hX.toFixed(1)}" y="${textY.toFixed(1)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="900" fill="#f5f5f5">H</text>
  <text x="${dX.toFixed(1)}" y="${textY.toFixed(1)}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="900" fill="#9b5df5">D</text>
</svg>`;
}

async function generate(size) {
  const svg  = Buffer.from(buildSvg(size));
  const dest = path.join(out, `icon-${size}.png`);
  await sharp(svg).png().toFile(dest);
  console.log(`✓ icons/icon-${size}.png`);
}

(async () => {
  await generate(192);
  await generate(512);
  console.log('Icons generated.');
})();
