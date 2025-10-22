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
    moves
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
  constructor({ userId, displayName, oozu = [], currency = 0 }) {
    this.userId = String(userId);
    this.displayName = String(displayName);
    this.oozu = oozu;
    this.currency = Number(currency);
  }

  findOozu(nickname) {
    const target = nickname.toLowerCase();
    return this.oozu.find((creature) => creature.nickname.toLowerCase() === target) ?? null;
  }

  asPublicDict(game) {
    return {
      trainer: this.displayName,
      oozorbs: this.currency,
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
