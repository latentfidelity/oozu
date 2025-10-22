import { describe, expect, it, beforeAll } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { GameService } from '../src/game/gameService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GameService template lookup', () => {
  let game;

  beforeAll(async () => {
    const storeStub = {
      loadPlayers: async () => new Map(),
      savePlayers: async () => {}
    };

    game = new GameService({
      store: storeStub,
      templateFile: resolve(__dirname, '../data/oozu_templates.json')
    });

    await game.initialize();
  });

  it('finds templates by display name', () => {
    const template = game.findTemplate('Water Oozu');
    expect(template?.templateId).toBe('water_oozu');
  });

  it('finds templates by id and case-insensitive slug', () => {
    expect(game.findTemplate('lightning_oozu')?.name).toBe('Lightning Oozu');
    expect(game.findTemplate('shadow_oozu')?.element).toBe('Shadow');
    expect(game.findTemplate('terra oozu')?.tier).toBe('Oozu');
  });

  it('returns null for unknown queries', () => {
    expect(game.findTemplate('unknown')).toBeNull();
  });
});
