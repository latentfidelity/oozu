import { readFile } from 'fs/promises';
import { randomInt } from 'crypto';

import {
  BattleLogEntry,
  BattleSummary,
  ItemTemplate,
  Move,
  PlayerOozu,
  PlayerProfile,
  OozuTemplate,
  DEFAULT_MAX_STAMINA
} from './models.js';

export class GameService {
  constructor({ store, templateFile, itemsFile = null }) {
    this.store = store;
    this.templateFile = templateFile;
    this.itemsFile = itemsFile;
    this.players = new Map();
    this.templates = new Map();
    this.items = new Map();
    this._lock = Promise.resolve();
  }

  async initialize() {
    this.players = await this.store.loadPlayers();
    this.templates = await this.loadTemplatesFromFile();
    this.items = await this.loadItemsFromFile();
  }

  async withLock(fn) {
    const previous = this._lock;
    let release;
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    this._lock = previous.then(() => wait);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async loadTemplatesFromFile() {
    let raw;
    try {
      raw = await readFile(this.templateFile, { encoding: 'utf-8' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `Missing Oozu template data file at ${this.templateFile}. Add starter data or adjust Oozu settings.`
        );
      }
      throw err;
    }

    const payload = JSON.parse(raw);
    const result = new Map();
    for (const entry of payload) {
      const moves =
        entry.moves?.map(
          (move) =>
            new Move({
              name: move.name,
              power: move.power,
              description: move.description
            })
        ) ?? [];
      const template = new OozuTemplate({
        templateId: entry.template_id,
        name: entry.name,
        element: entry.element,
        tier: entry.tier ?? 'Oozu',
        sprite: entry.sprite ?? '',
        description: entry.description,
        baseHp: entry.base_hp,
        baseAttack: entry.base_attack,
        baseDefense: entry.base_defense,
        moves,
        aliases: Array.isArray(entry.aliases) ? entry.aliases : []
      });
      result.set(template.templateId, template);
    }
    return result;
  }

  async loadItemsFromFile() {
    if (!this.itemsFile) {
      return new Map();
    }

    let raw;
    try {
      raw = await readFile(this.itemsFile, { encoding: 'utf-8' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return new Map();
      }
      throw err;
    }

    if (!raw.trim()) {
      return new Map();
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      console.error('[game] failed to parse items file', err);
      return new Map();
    }

    const result = new Map();
    for (const entry of payload) {
      const itemId = entry?.item_id ?? entry?.itemId ?? entry?.id;
      if (!itemId) {
        continue;
      }
      const item = new ItemTemplate({
        itemId,
        name: entry.name,
        description: entry.description,
        type: entry.type ?? 'general'
      });
      const key = String(item.itemId);
      result.set(key, item);
    }
    return result;
  }

  listItems() {
    return Array.from(this.items.values());
  }

  getItem(itemId) {
    if (!itemId) {
      return null;
    }
    const direct = this.items.get(String(itemId));
    if (direct) {
      return direct;
    }
    const normalized = String(itemId).toLowerCase();
    for (const item of this.items.values()) {
      if (item.itemId.toLowerCase() === normalized) {
        return item;
      }
    }
    return null;
  }

  findItem(query) {
    if (!query) {
      return null;
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const direct = this.items.get(normalized);
    if (direct) {
      return direct;
    }

    for (const item of this.items.values()) {
      const name = item.name?.toLowerCase();
      if (item.itemId.toLowerCase() === normalized || (name && name === normalized)) {
        return item;
      }
    }
    return null;
  }

  listTemplates() {
    return Array.from(this.templates.values());
  }

  findTemplate(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const slug = normalized.includes(' ') ? normalized.replace(/\s+/g, '_') : normalized;

    const direct = this.templates.get(normalized) ?? this.templates.get(slug);
    if (direct) {
      return direct;
    }

    for (const template of this.templates.values()) {
      const variants = new Set();
      const id = template.templateId.toLowerCase();
      variants.add(id);
      variants.add(id.replace(/\s+/g, '_'));

      const name = template.name.toLowerCase();
      variants.add(name);
      variants.add(name.replace(/\s+/g, '_'));

      if (Array.isArray(template.aliases) && template.aliases.length > 0) {
        for (const alias of template.aliases) {
          const aliasLower = alias.trim().toLowerCase();
          if (!aliasLower) {
            continue;
          }
          variants.add(aliasLower);
          variants.add(aliasLower.replace(/\s+/g, '_'));
        }
      }

      if (variants.has(normalized) || variants.has(slug)) {
        return template;
      }
    }
    return null;
  }

  getTemplate(templateId) {
    return this.templates.get(templateId) ?? null;
  }

  getPlayer(userId) {
    return this.players.get(userId) ?? null;
  }

  listPlayerOozu(userId) {
    const profile = this.players.get(userId);
    if (!profile) {
      return [];
    }
    return [...profile.oozu];
  }

  listInventory(userId) {
    const profile = this.players.get(userId);
    if (!profile) {
      return [];
    }
    return profile.inventoryEntries();
  }

  async addItemToInventory(userId, itemId, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive integer.');
    }

    const item = this.getItem(itemId);
    if (!item) {
      throw new Error('Unknown item id.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before receiving items.');
      }
      const updated = profile.adjustItemQuantity(item.itemId, quantity);
      await this.persist();
      return { profile, item, quantity: updated };
    });
  }

  async removeItemFromInventory(userId, itemId, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive integer.');
    }

    const item = this.getItem(itemId);
    if (!item) {
      throw new Error('Unknown item id.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before using items.');
      }
      const owned = profile.getItemQuantity(item.itemId);
      if (owned < quantity) {
        throw new Error('Not enough items in inventory.');
      }
      profile.adjustItemQuantity(item.itemId, -quantity);
      await this.persist();
      return { profile, item, remaining: profile.getItemQuantity(item.itemId) };
    });
  }

  async setPlayerPortrait({ userId, portraitUrl }) {
    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before updating their portrait.');
      }

      const trimmed = typeof portraitUrl === 'string' ? portraitUrl.trim() : '';
      if (!trimmed) {
        profile.portraitUrl = null;
      } else {
        let parsed;
        try {
          parsed = new URL(trimmed);
        } catch (err) {
          throw new Error('Provide a valid image URL using http or https.');
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Provide a valid image URL using http or https.');
        }
        profile.portraitUrl = parsed.toString();
      }

      await this.persist();
      return profile;
    });
  }

  async tradeItem({ fromUserId, toUserId, itemId, quantity = 1 }) {
    if (!fromUserId || !toUserId) {
      throw new Error('Both players are required for a trade.');
    }
    if (fromUserId === toUserId) {
      throw new Error('Cannot trade items with yourself.');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive integer.');
    }

    const item = this.getItem(itemId);
    if (!item) {
      throw new Error('Unknown item id.');
    }

    return this.withLock(async () => {
      const sender = this.players.get(fromUserId);
      const recipient = this.players.get(toUserId);
      if (!sender) {
        throw new Error('The sender is not registered.');
      }
      if (!recipient) {
        throw new Error('The recipient is not registered.');
      }

      const owned = sender.getItemQuantity(item.itemId);
      if (owned < quantity) {
        throw new Error('Not enough items to trade.');
      }

      sender.adjustItemQuantity(item.itemId, -quantity);
      recipient.adjustItemQuantity(item.itemId, quantity);
      await this.persist();
      return { sender, recipient, item, quantity };
    });
  }

  async giveItemToOozu({ userId, oozuIndex, itemId }) {
    if (!Number.isInteger(oozuIndex) || oozuIndex < 0) {
      throw new Error('That Oozu is not available.');
    }

    const item = this.getItem(itemId);
    if (!item) {
      throw new Error('Unknown item id.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before giving items.');
      }
      if (oozuIndex >= profile.oozu.length) {
        throw new Error('That Oozu is not available.');
      }

      const owned = profile.getItemQuantity(item.itemId);
      if (owned <= 0) {
        throw new Error('You do not have that item.');
      }

      const creature = profile.oozu[oozuIndex];
      if (creature.heldItem === item.itemId) {
        throw new Error('That Oozu is already holding that item.');
      }
      const previousItem = creature.heldItem;
      profile.adjustItemQuantity(item.itemId, -1);
      creature.heldItem = item.itemId;
      if (previousItem && previousItem !== item.itemId) {
        profile.adjustItemQuantity(previousItem, 1);
      }
      await this.persist();
      return { profile, creature, item, previousItem };
    });
  }

  async unequipItemFromOozu({ userId, oozuIndex }) {
    if (!Number.isInteger(oozuIndex) || oozuIndex < 0) {
      throw new Error('That Oozu is not available.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before giving items.');
      }
      if (oozuIndex >= profile.oozu.length) {
        throw new Error('That Oozu is not available.');
      }

      const creature = profile.oozu[oozuIndex];
      const heldItem = creature.heldItem;
      if (!heldItem) {
        throw new Error('That Oozu is not holding an item.');
      }

      creature.heldItem = null;
      profile.adjustItemQuantity(heldItem, 1);
      await this.persist();
      return { profile, creature, itemId: heldItem };
    });
  }

  async registerPlayer({ userId, displayName, gender = null, pronoun = null, playerClass, starterTemplateId }) {
    return this.withLock(async () => {
      if (this.players.has(userId)) {
        throw new Error('Player is already registered.');
      }

      const template = this.templates.get(starterTemplateId);
      if (!template) {
        throw new Error(`Unknown starter template id ${starterTemplateId}`);
      }

      const starter = new PlayerOozu({
        templateId: template.templateId,
        nickname: template.name,
        level: 1
      });

      const profile = new PlayerProfile({
        userId,
        displayName,
        gender,
        pronoun,
        playerClass,
        currency: 100,
        oozu: [starter],
        stamina: DEFAULT_MAX_STAMINA,
        maxStamina: DEFAULT_MAX_STAMINA
      });

      this.players.set(userId, profile);
      await this.persist();
      return profile;
    });
  }

  async collectOozu(userId, templateId, { nickname } = {}) {
    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before collecting Oozu.');
      }

      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Unknown Oozu template id ${templateId}`);
      }

      const finalNickname = this.ensureUniqueNickname(profile, nickname ?? template.name);
      const creature = new PlayerOozu({
        templateId: template.templateId,
        nickname: finalNickname,
        level: 1
      });

      profile.oozu.push(creature);
      await this.persist();
      return creature;
    });
  }

  async spendStamina(userId, amount = 1) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Stamina cost must be a positive integer.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before taking actions.');
      }

      if (profile.stamina < amount) {
        throw new Error('Not enough stamina.');
      }

      profile.stamina -= amount;
      await this.persist();
      return profile;
    });
  }

  async renameOozu({ userId, index, nickname }) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('That Oozu is not available.');
    }

    const desired = String(nickname ?? '').trim();
    if (!desired) {
      throw new Error('Nickname cannot be empty.');
    }
    if (desired.length > 32) {
      throw new Error('Nickname must be 32 characters or fewer.');
    }

    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before renaming Oozu.');
      }

      if (index >= profile.oozu.length) {
        throw new Error('That Oozu is not available.');
      }

      const target = profile.oozu[index];
      const existing = profile.findOozu(desired);
      if (existing && existing !== target) {
        throw new Error('Another Oozu already uses that nickname.');
      }

      target.nickname = desired;
      await this.persist();
      return { profile, creature: target };
    });
  }

  ensureUniqueNickname(profile, nickname) {
    const base = nickname;
    let suffix = 2;
    let candidate = nickname;
    while (profile.findOozu(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  async battle({ challenger, challengerOozu, opponent, opponentOozu }) {
    return this.withLock(async () => {
      const templateA = this.templates.get(challengerOozu.templateId);
      const templateB = this.templates.get(opponentOozu.templateId);
      if (!templateA || !templateB) {
        throw new Error('Unknown Oozu template referenced in battle.');
      }

      let hpA = this.calculateHp(templateA, challengerOozu.level);
      let hpB = this.calculateHp(templateB, opponentOozu.level);

      const attackA = this.calculateAttack(templateA, challengerOozu.level);
      const attackB = this.calculateAttack(templateB, opponentOozu.level);

      const defenseA = this.calculateDefense(templateA, challengerOozu.level);
      const defenseB = this.calculateDefense(templateB, opponentOozu.level);

      let rounds = 0;
      const log = [];

      while (hpA > 0 && hpB > 0 && rounds < 12) {
        rounds += 1;
        const damageA = this.damage(attackA, defenseB);
        hpB -= damageA;
        log.push(
          new BattleLogEntry({
            actor: challengerOozu.nickname,
            action: 'attacked',
            value: damageA
          })
        );

        if (hpB <= 0) {
          break;
        }

        const damageB = this.damage(attackB, defenseA);
        hpA -= damageB;
        log.push(
          new BattleLogEntry({
            actor: opponentOozu.nickname,
            action: 'countered',
            value: damageB
          })
        );
      }

      const winner = hpA > hpB ? challenger.displayName : opponent.displayName;

      if (winner === challenger.displayName) {
        challenger.currency += 25;
        opponent.currency = Math.max(0, opponent.currency - 10);
      } else {
        opponent.currency += 25;
        challenger.currency = Math.max(0, challenger.currency - 10);
      }

      await this.persist();

      return new BattleSummary({
        challenger: challenger.displayName,
        opponent: opponent.displayName,
        winner,
        rounds,
        log
      });
    });
  }

  getBaseTemplates() {
    return this.listTemplates().filter((template) => (template.tier ?? '').toLowerCase() === 'oozu');
  }

  sampleStarterTemplates(count = 3) {
    const pool = this.getBaseTemplates();
    if (pool.length === 0) {
      throw new Error('No starter templates available.');
    }
    if (pool.length <= count) {
      return [...pool];
    }

    const chosen = [];
    const used = new Set();
    while (chosen.length < count && used.size < pool.length) {
      const idx = randomInt(pool.length);
      if (used.has(idx)) {
        continue;
      }
      used.add(idx);
      chosen.push(pool[idx]);
    }
    return chosen;
  }

  calculateHp(template, level) {
    return template.baseHp + level * 5;
  }

  calculateAttack(template, level) {
    return template.baseAttack + level * 2;
  }

  calculateDefense(template, level) {
    return template.baseDefense + level;
  }

  calculateMp(template, level) {
    const baseAttack = Number.isFinite(template.baseAttack) ? template.baseAttack : 0;
    const baseDefense = Number.isFinite(template.baseDefense) ? template.baseDefense : 0;
    const mp = baseAttack + Math.floor(baseDefense / 2) + level * 3;
    return Math.max(0, mp);
  }

  damage(attack, defense) {
    const variance = randomInt(-2, 5); // upper bound exclusive
    const raw = attack - Math.floor(defense / 2) + variance;
    return Math.max(3, raw);
  }

  async resetPlayer(userId) {
    return this.withLock(async () => {
      const existed = this.players.delete(userId);
      if (existed) {
        await this.persist();
      }
      return existed;
    });
  }

  async persist() {
    await this.store.savePlayers([...this.players.values()]);
  }
}
