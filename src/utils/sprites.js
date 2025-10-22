import { readFile } from 'fs/promises';
import { basename, extname, resolve } from 'path';

import { AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';

/**
 * Create a Discord attachment for an Oozu sprite, optionally scaling the image.
 *
 * @param {string} spritePath - Relative path to the sprite asset.
 * @param {object} options
 * @param {number} [options.scale=1] - Scale multiplier (e.g. 0.25 for 25% size).
 * @param {string} [options.variant='full'] - Suffix appended to the filename to keep attachments unique.
 * @returns {Promise<{ attachment: AttachmentBuilder, fileName: string }>}
 */
export async function createSpriteAttachment(
  spritePath,
  { scale = 1, targetWidth, targetHeight, variant = 'full' } = {}
) {
  const absolute = resolve(process.cwd(), spritePath);
  const buffer = await readFile(absolute);

  let output = buffer;
  if (typeof targetWidth === 'number' || typeof targetHeight === 'number') {
    const image = sharp(buffer);
    output = await image
      .resize({
        width: targetWidth ? Math.max(1, Math.round(targetWidth)) : undefined,
        height: targetHeight ? Math.max(1, Math.round(targetHeight)) : undefined,
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
  } else if (scale !== 1) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const width = metadata.width ? Math.max(1, Math.round(metadata.width * scale)) : undefined;
    const height = metadata.height ? Math.max(1, Math.round(metadata.height * scale)) : undefined;
    output = await image
      .resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
  }

  const ext = extname(spritePath) || '.png';
  const base = basename(spritePath, ext);
  const suffix = variant ? `_${variant}` : '';
  const fileName = `${base}${suffix}${ext}`;

  const attachment = new AttachmentBuilder(output, { name: fileName });
  return { attachment, fileName };
}
