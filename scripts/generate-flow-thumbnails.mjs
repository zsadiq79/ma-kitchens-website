import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "public", "menu-images");
const targetDir = path.join(root, "public", "flow-thumbnails");
const maxBytes = 95 * 1024;

await fs.mkdir(targetDir, { recursive: true });

const entries = await fs.readdir(sourceDir, { withFileTypes: true });
const images = entries.filter(
  (entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name),
);

for (const entry of images) {
  const sourcePath = path.join(sourceDir, entry.name);
  const stem = path.parse(entry.name).name.replace(/[^A-Za-z0-9_-]/g, "");

  if (!stem) {
    continue;
  }

  const targetPath = path.join(targetDir, `${stem}.jpg`);

  let quality = 68;

  while (quality >= 45) {
    await sharp(sourcePath)
      .rotate()
      .resize(320, 320, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
      })
      .toFile(targetPath);

    const stats = await fs.stat(targetPath);

    if (stats.size <= maxBytes) {
      console.log(
        `Flow thumbnail ready: ${path.basename(targetPath)} (${stats.size} bytes)`,
      );
      break;
    }

    quality -= 8;
  }

  const finalStats = await fs.stat(targetPath);

  if (finalStats.size > maxBytes) {
    throw new Error(
      `Flow thumbnail ${path.basename(targetPath)} is ${finalStats.size} bytes; expected <= ${maxBytes}.`,
    );
  }
}
