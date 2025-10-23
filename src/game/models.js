export const DEFAULT_MAX_STAMINA = 3;

export class Move {
  constructor({ name, power, description }) {
    this.name = name;
    this.power = Number(power);
    this.description = description;
  }
}

export class OozuTemplate {
  constructor({
    templateId,
    name,
    element,
    tier,
    sprite,
    description,
    baseHp,
    baseAttack,
    baseDefense,
    moves,
    aliases = []
  }) {
    this.templateId = String(templateId);
    this.name = name;
    this.element = element;
    this.tier = tier;
    this.sprite = sprite;
    this.description = description;
    this.baseHp = Number(baseHp);
    this.baseAttack = Number(baseAttack);
    this.baseDefense = Number(baseDefense);
    this.moves = moves;
    this.aliases = Array.isArray(aliases) ? aliases.map((alias) => String(alias)) : [];
  }
}

export class PlayerOozu {
  constructor({ templateId, nickname, level = 1, experience = 0 }) {
    this.templateId = String(templateId);
    this.nickname = String(nickname);
    this.level = Number(level);
    this.experience = Number(experience);
  }
}

export class PlayerProfile {
  constructor({
    userId,
    displayName,
    playerClass = null,
    oozu = [],
    currency = 0,
    stamina = DEFAULT_MAX_STAMINA,
    maxStamina = DEFAULT_MAX_STAMINA
  }) {
    this.userId = String(userId);
    this.displayName = String(displayName);
    this.playerClass = playerClass ? String(playerClass) : null;
    this.oozu = oozu;
    this.currency = Number(currency);
    this.maxStamina = Number.isFinite(maxStamina) && maxStamina > 0 ? Number(maxStamina) : DEFAULT_MAX_STAMINA;
    const currentStamina = Number.isFinite(stamina) ? Number(stamina) : this.maxStamina;
    this.stamina = Math.max(0, Math.min(currentStamina, this.maxStamina));
  }

  findOozu(nickname) {
    const target = nickname.toLowerCase();
    return this.oozu.find((creature) => creature.nickname.toLowerCase() === target) ?? null;
  }

  asPublicDict(game) {
    return {
      player: this.displayName,
      class: this.playerClass,
      oozorbs: this.currency,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      oozu: this.oozu.map((creature) => {
        const template = game.getTemplate(creature.templateId);
        return {
          nickname: creature.nickname,
          form: template?.name ?? creature.templateId,
          level: creature.level,
          element: template?.element
        };
      })
    };
  }
}

export class BattleLogEntry {
  constructor({ actor, action, value }) {
    this.actor = actor;
    this.action = action;
    this.value = value;
  }
}

export class BattleSummary {
  constructor({ challenger, opponent, winner, rounds, log }) {
    this.challenger = challenger;
    this.opponent = opponent;
    this.winner = winner;
    this.rounds = rounds;
    this.log = log;
  }
}
