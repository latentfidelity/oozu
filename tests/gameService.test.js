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
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
    });

    await game.initialize();
  });

  it('finds templates by display name', () => {
    const template = game.findTemplate('Water Oozu');
    expect(template?.templateId).toBe('water_oozu');
  });

  it('finds templates by id and case-insensitive slug', () => {
    expect(game.findTemplate('lightning_oozu')?.name).toBe('Fulmen Oozu');
    expect(game.findTemplate('shadow_oozu')?.element).toBe('Umbra');
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
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
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
      gender: 'Male',
      pronoun: 'he',
      playerClass: 'Hunter',
      starterTemplateId: 'fire_oozu'
    });

    expect(profile.playerClass).toBe('Hunter');
    expect(profile.oozu).toHaveLength(1);
    expect(profile.oozu[0].templateId).toBe('fire_oozu');
    expect(profile.stamina).toBe(3);
    expect(profile.maxStamina).toBe(3);
    expect(profile.pronoun).toBe('he');
  });

  it('prevents duplicate registration', async () => {
    await game.registerPlayer({
      userId: '123',
      displayName: 'Tester',
      gender: 'Female',
      pronoun: 'she',
      playerClass: 'Alchemist',
      starterTemplateId: 'mystic_oozu'
    });

    await expect(
      game.registerPlayer({
        userId: '123',
        displayName: 'Tester 2',
        gender: 'Other',
        pronoun: 'they',
        playerClass: 'Tamer',
        starterTemplateId: 'water_oozu'
      })
    ).rejects.toThrow('Player is already registered.');
  });
});

describe('GameService rename Oozu', () => {
  let game;

  beforeEach(async () => {
    const storeStub = {
      loadPlayers: async () => new Map(),
      savePlayers: async () => {}
    };

    game = new GameService({
      store: storeStub,
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
    });

    await game.initialize();
    await game.registerPlayer({
      userId: 'rename-user',
      displayName: 'Renamer',
      gender: 'Female',
      pronoun: 'she',
      playerClass: 'Tamer',
      starterTemplateId: 'water_oozu'
    });
  });

  it('renames an Oozu when nickname is unique', async () => {
    const result = await game.renameOozu({ userId: 'rename-user', index: 0, nickname: 'Splash' });
    expect(result.creature.nickname).toBe('Splash');
    expect(game.getPlayer('rename-user').oozu[0].nickname).toBe('Splash');
  });

  it('rejects duplicate nicknames', async () => {
    await game.collectOozu('rename-user', 'fire_oozu');
    await expect(game.renameOozu({ userId: 'rename-user', index: 1, nickname: 'Aqua Oozu' })).rejects.toThrow(
      'Another Oozu already uses that nickname.'
    );
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
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
    });

    await game.initialize();
  });

  it('removes player profiles and persists state', async () => {
    const userId = '123';
    const profile = await game.registerPlayer({
      userId,
      displayName: 'Tester',
      gender: 'Male',
      pronoun: 'he',
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

describe('GameService stamina spending', () => {
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
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
    });

    await game.initialize();
    await game.registerPlayer({
      userId: 'stamina-user',
      displayName: 'Runner',
      gender: 'Other',
      pronoun: 'they',
      playerClass: 'Hunter',
      starterTemplateId: 'fire_oozu'
    });
  });

  it('spends stamina and persists the update', async () => {
    savedPlayers = null;
    const profile = game.getPlayer('stamina-user');
    expect(profile).not.toBeNull();
    if (!profile) {
      return;
    }
    const initialStamina = profile.stamina;
    expect(initialStamina).toBeGreaterThan(0);

    const updated = await game.spendStamina('stamina-user', 1);
    expect(updated.stamina).toBe(initialStamina - 1);
    expect(savedPlayers).not.toBeNull();
    const persisted = savedPlayers?.find((entry) => entry.userId === 'stamina-user');
    expect(persisted).toBeDefined();
    expect(persisted?.stamina).toBe(updated.stamina);
  });

  it('rejects when stamina is exhausted', async () => {
    const profile = game.getPlayer('stamina-user');
    expect(profile).not.toBeNull();
    if (!profile) {
      return;
    }
    await game.spendStamina('stamina-user', profile.stamina);
    await expect(game.spendStamina('stamina-user', 1)).rejects.toThrow('Not enough stamina.');
  });
});

describe('GameService inventory management', () => {
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
      templateFile: resolve(__dirname, '../data/oozu_templates.json'),
      itemsFile: resolve(__dirname, '../data/items.json')
    });

    await game.initialize();
    await game.registerPlayer({
      userId: 'inventory-user',
      displayName: 'Collector',
      gender: 'Other',
      pronoun: 'they',
      playerClass: 'Alchemist',
      starterTemplateId: 'water_oozu'
    });

    await game.registerPlayer({
      userId: 'trade-target',
      displayName: 'Trader',
      gender: 'Male',
      pronoun: 'he',
      playerClass: 'Hunter',
      starterTemplateId: 'fire_oozu'
    });
  });

  it('adds items to inventory and persists changes', async () => {
    const result = await game.addItemToInventory('inventory-user', 'healing_orb', 2);
    expect(result.profile.getItemQuantity('healing_orb')).toBe(2);
    expect(result.item.itemId).toBe('healing_orb');
    expect(savedPlayers).not.toBeNull();
    const persisted = savedPlayers?.find((entry) => entry.userId === 'inventory-user');
    expect(persisted?.inventory?.get('healing_orb')).toBe(2);
  });

  it('equips and unequips held items correctly', async () => {
    await game.addItemToInventory('inventory-user', 'healing_orb', 2);
    const equip = await game.giveItemToOozu({
      userId: 'inventory-user',
      oozuIndex: 0,
      itemId: 'healing_orb'
    });
    expect(equip.creature.heldItem).toBe('healing_orb');
    expect(equip.profile.getItemQuantity('healing_orb')).toBe(1);

    const unequip = await game.unequipItemFromOozu({
      userId: 'inventory-user',
      oozuIndex: 0
    });
    expect(unequip.creature.heldItem).toBeNull();
    expect(unequip.itemId).toBe('healing_orb');
    expect(unequip.profile.getItemQuantity('healing_orb')).toBe(2);
  });

  it('trades items between players', async () => {
    await game.addItemToInventory('inventory-user', 'power_charm', 3);
    const trade = await game.tradeItem({
      fromUserId: 'inventory-user',
      toUserId: 'trade-target',
      itemId: 'power_charm',
      quantity: 2
    });

    expect(trade.sender.getItemQuantity('power_charm')).toBe(1);
    expect(trade.recipient.getItemQuantity('power_charm')).toBe(2);
    expect(trade.item.itemId).toBe('power_charm');
  });

  it('rejects removing items that are not owned', async () => {
    await game.addItemToInventory('inventory-user', 'defense_shell', 1);
    await game.removeItemFromInventory('inventory-user', 'defense_shell', 1);
    await expect(
      game.removeItemFromInventory('inventory-user', 'defense_shell', 1)
    ).rejects.toThrow('Not enough items in inventory.');
  });

  it('discards items from inventory', async () => {
    await game.addItemToInventory('inventory-user', 'healing_orb', 3);
    const result = await game.removeItemFromInventory('inventory-user', 'healing_orb', 2);
    expect(result.item.itemId).toBe('healing_orb');
    expect(result.profile.getItemQuantity('healing_orb')).toBe(1);
  });

  it('updates and clears player portrait', async () => {
    const updated = await game.setPlayerPortrait({
      userId: 'inventory-user',
      portraitUrl: 'https://example.com/portrait.png'
    });
    expect(updated.portraitUrl).toBe('https://example.com/portrait.png');

    const cleared = await game.setPlayerPortrait({
      userId: 'inventory-user',
      portraitUrl: ''
    });
    expect(cleared.portraitUrl).toBeNull();
  });

  it('rejects invalid portrait urls', async () => {
    await expect(
      game.setPlayerPortrait({
        userId: 'inventory-user',
        portraitUrl: 'ftp://example.com/image.png'
      })
    ).rejects.toThrow('Provide a valid image URL using http or https.');
  });
});
