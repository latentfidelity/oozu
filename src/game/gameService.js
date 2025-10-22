import { readFile } from 'fs/promises';
import { randomInt } from 'crypto';

import {
  BattleLogEntry,
  BattleSummary,
  Move,
  PlayerOozu,
  PlayerProfile,
  Species
} from './models.js';

export class GameService {
  constructor({ store, speciesFile }) {
    this.store = store;
    this.speciesFile = speciesFile;
    this.players = new Map();
    this.species = new Map();
    this._lock = Promise.resolve();
  }

  async initialize() {
    this.players = await this.store.loadPlayers();
    this.species = await this.loadSpeciesFromFile();
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

  async loadSpeciesFromFile() {
    let raw;
    try {
      raw = await readFile(this.speciesFile, { encoding: 'utf-8' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `Missing species data file at ${this.speciesFile}. Add starter data or adjust Oozu settings.`
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
      const species = new Species({
        speciesId: entry.species_id,
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
      result.set(species.speciesId, species);
    }
    return result;
  }

  listSpecies() {
    return Array.from(this.species.values());
  }

  findSpecies(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const direct = this.species.get(normalized);
    if (direct) {
      return direct;
    }

    for (const species of this.species.values()) {
      const id = species.speciesId.toLowerCase();
      if (id === normalized) {
        return species;
      }
      const name = species.name.toLowerCase();
      if (name === normalized) {
        return species;
      }
      const slug = name.replace(/\s+/g, '_');
      if (slug === normalized) {
        return species;
      }
    }
    return null;
  }

  getSpecies(speciesId) {
    return this.species.get(speciesId) ?? null;
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

      const starter = this.starterSpecies();
      profile = new PlayerProfile({
        userId,
        displayName,
        currency: 100,
        oozu: [
          new PlayerOozu({
            speciesId: starter.speciesId,
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

  async catchSpecies(userId, speciesId, { nickname } = {}) {
    return this.withLock(async () => {
      const profile = this.players.get(userId);
      if (!profile) {
        throw new Error('Player must register before catching species.');
      }

      const species = this.species.get(speciesId);
      if (!species) {
        throw new Error(`Unknown species id ${speciesId}`);
      }

      const finalNickname = this.ensureUniqueNickname(profile, nickname ?? species.name);
      const creature = new PlayerOozu({
        speciesId: species.speciesId,
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
      const speciesA = this.species.get(challengerOozu.speciesId);
      const speciesB = this.species.get(opponentOozu.speciesId);
      if (!speciesA || !speciesB) {
        throw new Error('Unknown species referenced in battle.');
      }

      let hpA = this.calculateHp(speciesA, challengerOozu.level);
      let hpB = this.calculateHp(speciesB, opponentOozu.level);

      const attackA = this.calculateAttack(speciesA, challengerOozu.level);
      const attackB = this.calculateAttack(speciesB, opponentOozu.level);

      const defenseA = this.calculateDefense(speciesA, challengerOozu.level);
      const defenseB = this.calculateDefense(speciesB, opponentOozu.level);

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

  starterSpecies() {
    const first = this.species.values().next();
    if (first.done) {
      throw new Error('Species not loaded');
    }
    return first.value;
  }

  calculateHp(species, level) {
    return species.baseHp + level * 5;
  }

  calculateAttack(species, level) {
    return species.baseAttack + level * 2;
  }

  calculateDefense(species, level) {
    return species.baseDefense + level;
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
