import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'dist', 'capitalos_logo.png');
const OUT = resolve(ROOT, 'public', 'branding');
const BG_COLOR = '#050A1A';

mkdirSync(OUT, { recursive: true });

const standardIcons = [
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
];

const maskableIcons = [
  { name: 'icon-maskable-192x192.png', size: 192 },
  { name: 'icon-maskable-512x512.png', size: 512 },
];

async function generateStandard() {
  const source = sharp(SOURCE);
  const meta = await source.metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  await sharp(SOURCE)
    .resize(meta.width, meta.height, { fit: 'contain', background: BG_COLOR })
    .png()
    .toFile(resolve(OUT, 'capitalos_logo.png'));
  console.log('  capitalos_logo.png (original, flattened)');

  for (const icon of standardIcons) {
    await sharp(SOURCE)
      .resize(icon.size, icon.size, { fit: 'contain', background: BG_COLOR })
      .png()
      .toFile(resolve(OUT, icon.name));
    console.log(`  ${icon.name} (${icon.size}x${icon.size})`);
  }
}

async function generateMaskable() {
  for (const icon of maskableIcons) {
    const safeZone = Math.round(icon.size * 0.1);
    const innerSize = icon.size - safeZone * 2;

    const resized = await sharp(SOURCE)
      .resize(innerSize, innerSize, { fit: 'contain', background: BG_COLOR })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: icon.size,
        height: icon.size,
        channels: 4,
        background: BG_COLOR,
      },
    })
      .composite([{ input: resized, gravity: 'centre' }])
      .png()
      .toFile(resolve(OUT, icon.name));

    console.log(`  ${icon.name} (${icon.size}x${icon.size}, maskable)`);
  }
}

async function generateFavicon() {
  const png32 = await sharp(SOURCE)
    .resize(32, 32, { fit: 'contain', background: BG_COLOR })
    .png()
    .toBuffer();

  const ico = await pngToIco(png32);
  writeFileSync(resolve(OUT, 'favicon.ico'), ico);
  console.log('  favicon.ico (32x32)');
}

async function main() {
  console.log('Generating branding icons...');
  await generateStandard();
  await generateMaskable();
  await generateFavicon();
  console.log('Done. Icons written to public/branding/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
