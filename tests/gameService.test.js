import { describe, expect, it, beforeAll } from 'vitest';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { GameService } from '../src/game/gameService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GameService species lookup', () => {
  let game;

  beforeAll(async () => {
    const storeStub = {
      loadPlayers: async () => new Map(),
      savePlayers: async () => {}
    };

    game = new GameService({
      store: storeStub,
      speciesFile: resolve(__dirname, '../data/oozu_species.json')
    });

    await game.initialize();
  });

  it('finds species by display name', () => {
    const species = game.findSpecies('Water Oozu');
    expect(species?.speciesId).toBe('water_oozu');
  });

  it('finds species by id and case-insensitive slug', () => {
    expect(game.findSpecies('lightning_oozu')?.name).toBe('Lightning Oozu');
    expect(game.findSpecies('shadow_oozu')?.element).toBe('Shadow');
    expect(game.findSpecies('terra oozu')?.tier).toBe('Oozu');
  });

  it('returns null for unknown queries', () => {
    expect(game.findSpecies('unknown')).toBeNull();
  });
});
