import { readFile, readdir } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { randomInt } from 'crypto';

import { AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';

const SCENE_ROOT = 'sprites/scene';
const EVENT_ROOT = 'sprites/event';
const OOZU_ROOT = 'sprites/oozu';

const eventPrefixes = new Map([
  ['barrel', 'barrel'],
  ['chest', 'chest'],
  ['crate', 'crate'],
  ['shady_trader', 'shadytrader'],
  ['oozu', '']
]);

const cache = {
  scenes: null,
  scenesPromise: null,
  events: new Map(),
  allEventSprites: null,
  allEventPromise: null,
  oozu: null,
  oozuPromise: null
};

async function gatherSprites(relativeRoot) {
  const absolute = resolve(process.cwd(), relativeRoot);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const results = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await gatherSprites(join(relativeRoot, entry.name));
      results.push(...nested);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.(png|jpg|jpeg)$/i.test(entry.name)) {
      continue;
    }
    results.push(join(relativeRoot, entry.name));
  }
  return results;
}

async function listScenes() {
  if (cache.scenes) {
    return cache.scenes;
  }
  if (!cache.scenesPromise) {
    cache.scenesPromise = gatherSprites(SCENE_ROOT).then((files) => {
      cache.scenes = files;
      return files;
    });
  }
  return cache.scenesPromise;
}

async function listAllEventSprites() {
  if (cache.allEventSprites) {
    return cache.allEventSprites;
  }
  if (!cache.allEventPromise) {
    cache.allEventPromise = gatherSprites(EVENT_ROOT).then((files) => {
      cache.allEventSprites = files;
      return files;
    });
  }
  return cache.allEventPromise;
}

async function listEventSprites(type) {
  if (cache.events.has(type)) {
    return cache.events.get(type);
  }

  const prefix = eventPrefixes.get(type) ?? type;
  const all = await listAllEventSprites();
  let matches = all.filter((path) => {
    const name = basename(path) ?? '';
    return name.toLowerCase().startsWith(prefix.toLowerCase());
  });
  if (matches.length === 0) {
    matches = [...all];
  }
  cache.events.set(type, matches);
  return matches;
}

async function listOozuSprites() {
  if (cache.oozu) {
    return cache.oozu;
  }
  if (!cache.oozuPromise) {
    cache.oozuPromise = gatherSprites(OOZU_ROOT).then((files) => {
      cache.oozu = files;
      return files;
    });
  }
  return cache.oozuPromise;
}

function pickRandom(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  const idx = randomInt(array.length);
  return array[idx];
}

export async function sampleScenePath() {
  const scenes = await listScenes();
  if (scenes.length === 0) {
    throw new Error('No scene sprites are available.');
  }
  return pickRandom(scenes);
}

export async function sampleEventSpritePath(type) {
  const sprites = await listEventSprites(type);
  if (sprites.length === 0) {
    throw new Error('No event sprites are available.');
  }
  return pickRandom(sprites);
}

export async function sampleOozuSpritePath() {
  const sprites = await listOozuSprites();
  if (sprites.length === 0) {
    throw new Error('No oozu sprites are available.');
  }
  return pickRandom(sprites);
}

function ensurePositiveInteger(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

export async function composeQuestScene({ scenePath, eventPath, variant = 'scene' }) {
  if (!scenePath || !eventPath) {
    throw new Error('Both scene and event sprite paths are required.');
  }

  const sceneAbsolute = resolve(process.cwd(), scenePath);
  const eventAbsolute = resolve(process.cwd(), eventPath);
  const sceneBuffer = await readFile(sceneAbsolute);
  const eventBuffer = await readFile(eventAbsolute);

  const sceneImage = sharp(sceneBuffer);
  const sceneMeta = await sceneImage.metadata();
  const bgWidth = ensurePositiveInteger(sceneMeta.width, 512);
  const bgHeight = ensurePositiveInteger(sceneMeta.height, 512);

  const eventImage = sharp(eventBuffer);
  const eventMeta = await eventImage.metadata();
  const rawWidth = ensurePositiveInteger(eventMeta.width, Math.floor(bgWidth * 0.4));
  const rawHeight = ensurePositiveInteger(eventMeta.height, Math.floor(bgHeight * 0.4));

  const maxWidth = Math.floor(bgWidth * 0.55);
  const maxHeight = Math.floor(bgHeight * 0.5);
  const widthScale = maxWidth / rawWidth;
  const heightScale = maxHeight / rawHeight;
  const scale = Math.min(widthScale, heightScale, 1);

  const targetWidth = Math.max(1, Math.floor(rawWidth * scale));
  const targetHeight = Math.max(1, Math.floor(rawHeight * scale));

  const resizedBuffer = await eventImage
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: true
    })
    .toBuffer();

  const overlayMeta = await sharp(resizedBuffer).metadata();
  const overlayWidth = ensurePositiveInteger(overlayMeta.width, targetWidth);
  const overlayHeight = ensurePositiveInteger(overlayMeta.height, targetHeight);

  const left = Math.max(0, Math.floor((bgWidth - overlayWidth) / 2));
  const bottomMargin = Math.floor(bgHeight * 0.08);
  const top = Math.max(0, bgHeight - bottomMargin - overlayHeight);

  const compositeBuffer = await sceneImage
    .composite([
      {
        input: resizedBuffer,
        left,
        top
      }
    ])
    .png()
    .toBuffer();

  const fileName = `quest_${variant}.png`;
  return {
    attachment: new AttachmentBuilder(compositeBuffer, { name: fileName }),
    fileName
  };
}
