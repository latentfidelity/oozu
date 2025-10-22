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
        moves
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

    const direct = this.templates.get(normalized);
    if (direct) {
      return direct;
    }

    for (const template of this.templates.values()) {
      const id = template.templateId.toLowerCase();
      if (id === normalized) {
        return template;
      }
      const name = template.name.toLowerCase();
      if (name === normalized) {
        return template;
      }
      const slug = name.replace(/\s+/g, '_');
      if (slug === normalized) {
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

  async getOrRegisterPlayer(userId, displayName) {
    return this.withLock(async () => {
      let profile = this.players.get(userId);
      if (profile) {
        profile.displayName = displayName;
        return profile;
      }

      const starter = this.starterTemplate();
      profile = new PlayerProfile({
        userId,
        displayName,
        currency: 100,
        oozu: [
          new PlayerOozu({
            templateId: starter.templateId,
            nickname: starter.name,
            level: 1
          })
        ]
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

  starterTemplate() {
    const first = this.templates.values().next();
    if (first.done) {
      throw new Error('Oozu templates not loaded');
    }
    return first.value;
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

  async persist() {
    await this.store.savePlayers([...this.players.values()]);
  }
}
