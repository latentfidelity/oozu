export const DEFAULT_MAX_STAMINA = 3;

export class Move {
  constructor({ name, power, description }) {
    this.name = name;
    this.power = Number(power);
    this.description = description;
  }
}

export class ItemTemplate {
  constructor({ itemId, name, description, type = 'general' }) {
    this.itemId = String(itemId);
    this.name = name;
    this.description = description ?? '';
    this.type = type;
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
  constructor({ templateId, nickname, level = 1, experience = 0, heldItem = null }) {
    this.templateId = String(templateId);
    this.nickname = String(nickname);
    this.level = Number(level);
    this.experience = Number(experience);
    this.heldItem = heldItem ? String(heldItem) : null;
  }
}

export class PlayerProfile {
  constructor({
    userId,
    displayName,
    gender = null,
    pronoun = null,
    playerClass = null,
    oozu = [],
    currency = 0,
    stamina = DEFAULT_MAX_STAMINA,
    maxStamina = DEFAULT_MAX_STAMINA,
    inventory = null,
    portraitUrl = null
  }) {
    this.userId = String(userId);
    this.displayName = String(displayName);
    this.gender = gender ? String(gender) : null;
    this.pronoun = pronoun ? String(pronoun) : null;
    this.playerClass = playerClass ? String(playerClass) : null;
    this.oozu = oozu;
    this.currency = Number(currency);
    this.maxStamina = Number.isFinite(maxStamina) && maxStamina > 0 ? Number(maxStamina) : DEFAULT_MAX_STAMINA;
    const currentStamina = Number.isFinite(stamina) ? Number(stamina) : this.maxStamina;
    this.stamina = Math.max(0, Math.min(currentStamina, this.maxStamina));
    this.inventory = this.#loadInventory(inventory);
    this.portraitUrl = this.#sanitizePortrait(portraitUrl);
  }

  findOozu(nickname) {
    const target = nickname.toLowerCase();
    return this.oozu.find((creature) => creature.nickname.toLowerCase() === target) ?? null;
  }

  getItemQuantity(itemId) {
    return this.inventory.get(String(itemId)) ?? 0;
  }

  setItemQuantity(itemId, quantity) {
    const key = String(itemId);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.inventory.delete(key);
      return;
    }
    this.inventory.set(key, Math.floor(quantity));
  }

  adjustItemQuantity(itemId, delta) {
    const current = this.getItemQuantity(itemId);
    const next = current + delta;
    if (next <= 0) {
      this.inventory.delete(String(itemId));
      return 0;
    }
    this.inventory.set(String(itemId), next);
    return next;
  }

  inventoryEntries() {
    return Array.from(this.inventory.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity
    }));
  }

  asPublicDict(game) {
    return {
      player: this.displayName,
      gender: this.gender,
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
          element: template?.element,
          heldItem: creature.heldItem
        };
      }),
      inventory: this.inventoryEntries().map((entry) => {
        const item = game.getItem?.(entry.itemId);
        return {
          itemId: entry.itemId,
          name: item?.name ?? entry.itemId,
          quantity: entry.quantity
        };
      }),
      portrait: this.portraitUrl
    };
  }

  #loadInventory(inventory) {
    const result = new Map();
    if (!inventory) {
      return result;
    }

    if (inventory instanceof Map) {
      for (const [itemId, quantity] of inventory.entries()) {
        this.#tryAddInventory(result, itemId, quantity);
      }
      return result;
    }

    if (Array.isArray(inventory)) {
      for (const entry of inventory) {
        if (!entry) {
          continue;
        }
        if (Array.isArray(entry) && entry.length >= 2) {
          this.#tryAddInventory(result, entry[0], entry[1]);
          continue;
        }
        if (typeof entry === 'object') {
          const itemId = entry.itemId ?? entry.item_id ?? entry.id;
          const quantity = entry.quantity ?? entry.qty ?? entry.count;
          this.#tryAddInventory(result, itemId, quantity);
        }
      }
      return result;
    }

    if (typeof inventory === 'object') {
      for (const [itemId, quantity] of Object.entries(inventory)) {
        this.#tryAddInventory(result, itemId, quantity);
      }
    }

    return result;
  }

  #tryAddInventory(target, itemId, quantity) {
    const key = itemId ? String(itemId) : null;
    const value = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
    if (!key || value <= 0) {
      return;
    }
    target.set(key, value);
  }

  #sanitizePortrait(url) {
    if (!url) {
      return null;
    }
    const trimmed = String(url).trim();
    return trimmed || null;
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
