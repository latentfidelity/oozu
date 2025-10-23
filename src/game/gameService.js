import { readFile } from 'fs/promises';
import { randomInt } from 'crypto';

import { BattleLogEntry, BattleSummary, Move, PlayerOozu, PlayerProfile, OozuTemplate } from './models.js';

export class GameService {
  constructor({ store, templateFile }) {
    this.store = store;
    this.templateFile = templateFile;
    this.players = new Map();
    this.templates = new Map();
    this._lock = Promise.resolve();
  }

  async initialize() {
    this.players = await this.store.loadPlayers();
    this.templates = await this.loadTemplatesFromFile();
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

  async registerPlayer({ userId, displayName, playerClass, starterTemplateId }) {
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
        playerClass,
        currency: 100,
        oozu: [starter]
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
