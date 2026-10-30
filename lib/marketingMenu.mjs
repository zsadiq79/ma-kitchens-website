import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readPublishedOrderMenu } from './publishedOrderMenu.mjs';

// Public artwork only. Never accepts remote URLs or arbitrary filesystem paths.
export async function marketingMenu(record, now = new Date(), root = process.cwd()) {
  const menu = readPublishedOrderMenu(record, now);
  if (!menu) throw new Error('NO_ACTIVE_MENU');
  const dir = path.join(root, 'public', 'weekly-menus', menu.deliveryDate);
  const names = (await fs.readdir(dir)).filter(n => /^page-[1-9]\d*\.(?:png|jpe?g|webp)$/i.test(n))
    .sort((a, b) => Number(a.match(/^page-(\d+)/i)[1]) - Number(b.match(/^page-(\d+)/i)[1]));
  if (!names.length || names.length > 8 || new Set(names.map(n => Number(n.match(/^page-(\d+)/i)[1]))).size !== names.length)
    throw new Error('MENU_ARTWORK_MISSING_OR_AMBIGUOUS');
  const buffers = await Promise.all(names.map(n => fs.readFile(path.join(dir, n))));
  if (buffers.reduce((n, b) => n + b.length, 0) > 30000000) throw new Error('MENU_ARTWORK_TOO_LARGE');
  const hash = createHash('sha256').update(menu.menuRevision);
  buffers.forEach((b, i) => hash.update(names[i]).update(b));
  const imageHash = hash.digest('hex');
  return { menu, buffers, imageHash, pageCount: names.length };
}

export async function marketingJpeg(artwork) {
  const pages = [];
  for (const input of artwork.buffers) {
    const { data, info } = await sharp(input, { limitInputPixels: 60000000 }).rotate()
      .resize({ width: 1800 }).flatten({ background: '#ffffff' }).png().toBuffer({ resolveWithObject: true });
    pages.push({ data, width: info.width, height: info.height });
  }
  const height = pages.reduce((n, p) => n + p.height, 0);
  if (height > 18000) throw new Error('MENU_ARTWORK_TOO_TALL');
  let top = 0;
  const image = sharp({ create: { width: 1800, height, channels: 3, background: '#ffffff' } })
    .composite(pages.map(p => { const item = { input: p.data, left: 0, top }; top += p.height; return item; }));
  const jpeg = await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  if (jpeg.length > 5000000) throw new Error('MENU_IMAGE_EXCEEDS_WHATSAPP_LIMIT');
  return jpeg;
}
