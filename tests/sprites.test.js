import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import sharp from 'sharp';

import { createSpriteAttachment } from '../src/utils/sprites.js';

describe('createSpriteAttachment', () => {
  const spritePath = 'sprites/oozu/aqua_001.png';

  it('returns attachment metadata with expected file name and size when scaled', async () => {
    const originalBuffer = await readFile(spritePath);
    const originalMeta = await sharp(originalBuffer).metadata();

    const { attachment, fileName } = await createSpriteAttachment(spritePath, {
      scale: 0.25,
      variant: 'team_test'
    });

    expect(fileName).toBe('aqua_001_team_test.png');
    expect(attachment.name).toBe(fileName);
    expect(Buffer.isBuffer(attachment.attachment)).toBe(true);

    const scaledMeta = await sharp(attachment.attachment).metadata();
    expect(scaledMeta.width).toBeLessThanOrEqual(Math.ceil(originalMeta.width * 0.25) + 1);
    expect(scaledMeta.height).toBeLessThanOrEqual(Math.ceil(originalMeta.height * 0.25) + 1);
  });

  it('keeps original dimensions when scale is 1', async () => {
    const { attachment } = await createSpriteAttachment(spritePath, {
      scale: 1,
      variant: 'full'
    });

    const originalMeta = await sharp(await readFile(spritePath)).metadata();
    const resizedMeta = await sharp(attachment.attachment).metadata();

    expect(resizedMeta.width).toBe(originalMeta.width);
    expect(resizedMeta.height).toBe(originalMeta.height);
  });

  it('resizes to target width when provided', async () => {
    const targetWidth = 64;
    const { attachment, fileName } = await createSpriteAttachment(spritePath, {
      targetWidth,
      variant: 'icon'
    });

    expect(fileName).toBe('aqua_001_icon.png');
    const metadata = await sharp(attachment.attachment).metadata();
    expect(metadata.width).toBeLessThanOrEqual(targetWidth);
  });
});
