import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
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
    expect(game.findTemplate('earth oozu')?.tier).toBe('Oozu');
  });

  it('returns null for unknown queries', () => {
    expect(game.findTemplate('unknown')).toBeNull();
  });
});

describe('GameService registration', () => {
  let game;

  beforeEach(async () => {
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

  it('samples three unique starter templates', () => {
    const picks = game.sampleStarterTemplates(3);
    expect(picks).toHaveLength(3);
    const ids = new Set(picks.map((t) => t.templateId));
    expect(ids.size).toBe(3);
  });

  it('registers a new player with class and starter', async () => {
    const profile = await game.registerPlayer({
      userId: '123',
      displayName: 'Tester',
      playerClass: 'Hunter',
      starterTemplateId: 'fire_oozu'
    });

    expect(profile.playerClass).toBe('Hunter');
    expect(profile.oozu).toHaveLength(1);
    expect(profile.oozu[0].templateId).toBe('fire_oozu');
  });

  it('prevents duplicate registration', async () => {
    await game.registerPlayer({
      userId: '123',
      displayName: 'Tester',
      playerClass: 'Scientist',
      starterTemplateId: 'mystic_oozu'
    });

    await expect(
      game.registerPlayer({
        userId: '123',
        displayName: 'Tester 2',
        playerClass: 'Tamer',
        starterTemplateId: 'water_oozu'
      })
    ).rejects.toThrow('Player is already registered.');
  });
});

describe('GameService player reset', () => {
  let game;
  let savedPlayers;

  beforeEach(async () => {
    savedPlayers = null;
    const storeStub = {
      loadPlayers: async () => new Map(),
      savePlayers: async (players) => {
        savedPlayers = players;
      }
    };

    game = new GameService({
      store: storeStub,
      templateFile: resolve(__dirname, '../data/oozu_templates.json')
    });

    await game.initialize();
  });

  it('removes player profiles and persists state', async () => {
    const userId = '123';
    const profile = await game.registerPlayer({
      userId,
      displayName: 'Tester',
      playerClass: 'Tamer',
      starterTemplateId: 'water_oozu'
    });
    expect(profile).toBeDefined();
    expect(game.getPlayer(userId)).not.toBeNull();

    const removed = await game.resetPlayer(userId);
    expect(removed).toBe(true);
    expect(game.getPlayer(userId)).toBeNull();
    expect(savedPlayers).toEqual([]);
  });

  it('returns false when resetting a non-existent player', async () => {
    const removed = await game.resetPlayer('missing');
    expect(removed).toBe(false);
  });
});
