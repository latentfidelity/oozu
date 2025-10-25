import { randomInt } from 'crypto';

import { sampleEventSpritePath, sampleScenePath, sampleOozuSpritePath } from '../../utils/questScenes.js';

const QUEST_TYPE = 'Work';
const QUEST_SUBTYPE = 'Hunting';

const QUEST_STATUS = {
  ONGOING: 'ongoing',
  AWAITING_FINALE: 'awaiting_finale',
  COMPLETE: 'complete'
};

const REGULAR_EVENT_TYPES = ['barrel', 'chest', 'crate', 'shady_trader'];
const EVENT_DISPLAY_NAMES = {
  barrel: 'Weathered Barrel',
  chest: 'Forgotten Chest',
  crate: 'Abandoned Crate',
  shady_trader: 'Shady Trader',
  oozu: 'Wild Oozu'
};

const EVENT_PROMPTS = {
  barrel: 'A weathered barrel lies half-buried in the underbrush, its lid barely holding.',
  chest: 'An ornate chest rests atop a stone pedestal, faintly humming with energy.',
  crate: 'Supply crates are scattered across the clearing, some splintered, others sealed.',
  shady_trader: 'A cloaked trader waves you over, their stall cluttered with oddities.'
};

function randomToken(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[randomInt(alphabet.length)];
  }
  return output;
}

function pickRandom(array, { exclude = null } = {}) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  let pool = array;
  if (exclude !== null) {
    pool = array.filter((value) => value !== exclude);
  }
  if (pool.length === 0) {
    pool = [...array];
  }
  const idx = randomInt(pool.length);
  return pool[idx];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class HuntingQuestManager {
  constructor(game) {
    this.game = game;
    this.active = new Map();
  }

  getQuest(userId) {
    return this.active.get(String(userId)) ?? null;
  }

  async start(userId) {
    const key = String(userId);
    const existing = this.active.get(key);
    if (existing && (existing.status === QUEST_STATUS.ONGOING || existing.status === QUEST_STATUS.AWAITING_FINALE)) {
      return this.#buildResponse(existing, { resumed: true });
    }

    return this.game.withLock(async () => {
      const profile = this.game.players.get(key);
      if (!profile) {
        throw new Error('Player must register before taking on quests.');
      }

      if ((profile.playerClass ?? '').toLowerCase() !== 'hunter') {
        throw new Error('Only hunters can take hunting quests.');
      }

      if (profile.stamina < 1) {
        throw new Error('Not enough stamina.');
      }

      let quest = this.active.get(key);
      if (quest && quest.status === QUEST_STATUS.COMPLETE) {
        this.active.delete(key);
        quest = null;
      }

      quest = quest ?? this.#createQuest(key);

      profile.stamina -= 1;

      const eventType = pickRandom(REGULAR_EVENT_TYPES);
      quest.pendingEvent = await this.#createEncounter({
        quest,
        profile,
        type: eventType
      });
      quest.currentOptions = [];

      this.active.set(key, quest);
      this.game.normalizeProfileVitals(profile);
      await this.game.persist();

      return this.#buildResponse(quest, {});
    });
  }

  async choose({ userId, questId, optionId }) {
    const key = String(userId);
    return this.game.withLock(async () => {
      const quest = this.active.get(key);
      if (!quest || quest.id !== questId) {
        throw new Error('That quest is no longer active.');
      }
      if (quest.status !== QUEST_STATUS.ONGOING) {
        return this.#buildResponse(quest, { latest: quest.log.at(-1) ?? null });
      }
      if (quest.pendingEvent) {
        return this.#buildResponse(quest, { latest: quest.log.at(-1) ?? null });
      }

      const option = quest.currentOptions.find((entry) => entry.id === optionId);
      if (!option) {
        throw new Error('That path is no longer available.');
      }

      const profile = this.game.players.get(key);
      if (!profile) {
        this.active.delete(key);
        throw new Error('Player must register before taking on quests.');
      }

      const pending = await this.#createEncounter({
        quest,
        profile,
        type: option.type
      });

      quest.pendingEvent = pending;
      quest.currentOptions = [];

      this.active.set(key, quest);
      this.game.normalizeProfileVitals(profile);
      await this.game.persist();

      return this.#buildResponse(quest, { latest: quest.log.at(-1) ?? null });
    });
  }

  abandon(userId) {
    const key = String(userId);
    this.active.delete(key);
  }

  async finalize({ userId, questId }) {
    const key = String(userId);
    return this.game.withLock(async () => {
      const quest = this.active.get(key);
      if (!quest || quest.id !== questId) {
        throw new Error('That quest is no longer active.');
      }
      if (quest.status !== QUEST_STATUS.AWAITING_FINALE) {
        return this.#buildResponse(quest, { latest: quest.log.at(-1) ?? null });
      }

      const profile = this.game.players.get(key);
      if (!profile) {
        this.active.delete(key);
        throw new Error('Player must register before taking on quests.');
      }

      const finale = await this.#resolveFinale({ quest, profile });
      quest.log.push(finale);
      quest.stage = quest.targetRegularEvents + 1;
      quest.status = QUEST_STATUS.COMPLETE;
      quest.currentOptions = [];
      this.active.set(key, quest);
      this.game.normalizeProfileVitals(profile);
      await this.game.persist();
      return this.#buildResponse(quest, { latest: finale });
    });
  }

  async resolveEventAction({ userId, questId, optionId }) {
    const key = String(userId);
    return this.game.withLock(async () => {
      const quest = this.active.get(key);
      if (!quest || quest.id !== questId) {
        throw new Error('That quest is no longer active.');
      }
      if (!quest.pendingEvent) {
        throw new Error('There is no encounter awaiting a decision.');
      }
      if (quest.pendingEvent.id !== questId) {
        throw new Error('That encounter is no longer active.');
      }

      const option = quest.pendingEvent.options.find((entry) => entry.id === optionId);
      if (!option) {
        throw new Error('That choice is no longer available.');
      }

      const profile = this.game.players.get(key);
      if (!profile) {
        this.active.delete(key);
        throw new Error('Player must register before taking on quests.');
      }

      const result = option.resolve({
        quest,
        profile,
        game: this.game
      });

      const entry = {
        index: quest.log.length + 1,
        type: quest.pendingEvent.type,
        title: quest.pendingEvent.title,
        narrative: result.narrative,
        outcome: result.outcome,
        effects: result.effects,
        scene: quest.pendingEvent.scene,
        sprite: quest.pendingEvent.sprite
      };

      quest.log.push(entry);
      quest.pendingEvent = null;
      quest.stage += 1;

      if (quest.stage >= quest.targetRegularEvents) {
        quest.status = QUEST_STATUS.AWAITING_FINALE;
        quest.currentOptions = [];
      } else {
        quest.currentOptions = this.#buildOptions({
          previousType: entry.type
        });
      }

      this.active.set(key, quest);
      this.game.normalizeProfileVitals(profile);
      await this.game.persist();

      return this.#buildResponse(quest, { latest: entry });
    });
  }

  #createQuest(userId) {
    const totalEvents = randomAmount(3, 7);
    const regularEvents = Math.max(2, totalEvents - 1);
    return {
      id: randomToken(10),
      userId,
      type: QUEST_TYPE,
      subtype: QUEST_SUBTYPE,
      stage: 0,
      status: QUEST_STATUS.ONGOING,
      log: [],
      currentOptions: [],
      targetRegularEvents: regularEvents,
      pendingEvent: null
    };
  }

  #buildOptions({ previousType }) {
    const options = [];
    const visiblePool = REGULAR_EVENT_TYPES.filter((type) => type !== previousType);
    while (options.length < 2 && visiblePool.length > 0) {
      const choiceIdx = randomInt(visiblePool.length);
      const type = visiblePool.splice(choiceIdx, 1)[0];
      options.push({
        id: randomToken(6),
        type,
        hidden: false,
        label: EVENT_DISPLAY_NAMES[type] ?? type
      });
    }

    while (options.length < 2) {
      const type = pickRandom(REGULAR_EVENT_TYPES);
      options.push({
        id: randomToken(6),
        type,
        hidden: false,
        label: EVENT_DISPLAY_NAMES[type] ?? type
      });
    }

    const hiddenType = pickRandom(REGULAR_EVENT_TYPES);
    options.push({
      id: randomToken(6),
      type: hiddenType,
      hidden: true,
      label: 'Unknown Path'
    });

    const shuffled = [];
    const temp = [...options];
    while (temp.length > 0) {
      const idx = randomInt(temp.length);
      shuffled.push(temp.splice(idx, 1)[0]);
    }
    return shuffled;
  }

  async #createEncounter({ quest, profile, type }) {
    const prompt = EVENT_PROMPTS[type] ?? `You encounter a ${EVENT_DISPLAY_NAMES[type] ?? type}.`;
    const scene = await sampleScenePath();
    const sprite = await sampleEventSpritePath(type);
    const options = this.#buildEncounterOptions({
      quest,
      profile,
      type
    });
    return {
      id: quest.id,
      type,
      title: EVENT_DISPLAY_NAMES[type] ?? type,
      prompt,
      scene,
      sprite,
      options
    };
  }

  #buildEncounterOptions({ quest, profile, type }) {
    const candidates =
      EVENT_ACTION_TEMPLATES[type]?.map((factory) =>
        factory({
          quest,
          profile,
          game: this.game
        })
      ) ?? [];

    const selected =
      candidates.length <= 3
        ? [...candidates]
        : this.#shuffle([...candidates]).slice(0, 3);

    return selected.map((action) => ({
      id: randomToken(6),
      label: action.label,
      resolve: action.resolve
    }));
  }

  #shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async #resolveFinale({ quest, profile }) {
    const handler = EVENT_OUTCOMES.oozu;
    const result = handler({
      quest,
      profile,
      game: this.game
    });
    const scene = result.scene ?? (await sampleScenePath());
    const sprite = result.sprite ?? (await sampleOozuSpritePath());
    return {
      index: quest.log.length + 1,
      type: 'oozu',
      title: EVENT_DISPLAY_NAMES.oozu,
      ...result,
      scene,
      sprite
    };
  }

  #buildResponse(quest, { latest = null, resumed = false } = {}) {
    const pendingEvent = quest.pendingEvent
      ? {
          id: quest.pendingEvent.id,
          type: quest.pendingEvent.type,
          title: quest.pendingEvent.title,
          prompt: quest.pendingEvent.prompt,
          scene: quest.pendingEvent.scene ?? null,
          sprite: quest.pendingEvent.sprite ?? null
        }
      : null;

    return {
      quest: {
        id: quest.id,
        type: quest.type,
        subtype: quest.subtype,
        stage: quest.stage,
        maxStage: quest.targetRegularEvents + 1,
        status: quest.status,
        log: quest.log.map((entry) => ({
          index: entry.index,
          type: entry.type,
          title: entry.title,
          narrative: entry.narrative,
          outcome: entry.outcome,
          effects: entry.effects,
          scene: entry.scene ?? null,
          sprite: entry.sprite ?? null
        }))
      },
      pendingEvent,
      eventOptions: pendingEvent
        ? quest.pendingEvent.options.map((option) => ({
            id: option.id,
            label: option.label
          }))
        : [],
      pathOptions: pendingEvent
        ? []
        : quest.currentOptions.map((option) => ({
            id: option.id,
            label: option.hidden ? '???' : option.label,
            hidden: option.hidden,
            type: option.type
          })),
      latest,
      resumed
    };
  }
}

function resolveRandomOozu(profile) {
  if (!Array.isArray(profile.oozu) || profile.oozu.length === 0) {
    return null;
  }
  const idx = randomInt(profile.oozu.length);
  return { creature: profile.oozu[idx], index: idx };
}

function adjustHp({ game, creature, template, delta }) {
  game.normalizeCreatureVitals(creature, template);
  const maxHp = Math.max(0, Math.floor(game.calculateHp(template, creature.level)));
  const current = Number.isFinite(creature.currentHp) ? Math.floor(creature.currentHp) : maxHp;
  const next = clamp(current + delta, 0, maxHp);
  creature.currentHp = next;
  return next - current;
}

function adjustMp({ game, creature, template, delta }) {
  game.normalizeCreatureVitals(creature, template);
  const maxMp = Math.max(0, Math.floor(game.calculateMp(template, creature.level)));
  const current = Number.isFinite(creature.currentMp) ? Math.floor(creature.currentMp) : maxMp;
  const next = clamp(current + delta, 0, maxMp);
  creature.currentMp = next;
  return next - current;
}

function resolveCurrencyLoss(profile, amount) {
  const current = Math.max(0, Math.floor(profile.currency));
  const loss = Math.min(current, Math.max(0, amount));
  profile.currency = current - loss;
  return -loss;
}

function resolveCurrencyGain(profile, amount) {
  const gain = Math.max(0, Math.floor(amount));
  profile.currency = Math.max(0, Math.floor(profile.currency)) + gain;
  return gain;
}

function sampleInventoryItem(profile) {
  if (typeof profile.inventoryEntries !== 'function') {
    return null;
  }
  const entries = profile.inventoryEntries();
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const idx = randomInt(entries.length);
  const entry = entries[idx];
  return { itemId: entry.itemId, quantity: entry.quantity };
}

function removeInventoryItem(profile, itemId) {
  if (!itemId) {
    return false;
  }
  const owned = profile.getItemQuantity(itemId);
  if (owned <= 0) {
    return false;
  }
  profile.adjustItemQuantity(itemId, -1);
  return true;
}

function addInventoryItem(profile, itemId) {
  if (!itemId) {
    return false;
  }
  profile.adjustItemQuantity(itemId, 1);
  return true;
}

function randomAmount(min, max) {
  if (min === max) {
    return min;
  }
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return lower + randomInt(upper - lower + 1);
}

const EVENT_ACTION_TEMPLATES = {
  barrel: [
    ({ profile }) => ({
      label: 'Inspect the barrel carefully',
      resolve: () => {
        const amount = randomAmount(8, 18);
        const delta = resolveCurrencyGain(profile, amount);
        return {
          narrative: 'You pry the warped lid open and scoop out a stash of glittering Oozorbs.',
          outcome: `You gain ${delta} Oozorbs.`,
          effects: { currency: delta }
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Kick the barrel open',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          const amount = resolveCurrencyGain(profile, randomAmount(5, 12));
          return {
            narrative: 'The barrel bursts and coins spill across the ground.',
            outcome: `You grab ${amount} Oozorbs.`,
            effects: { currency: amount }
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const hpDelta = adjustHp({ game, creature, template, delta: -randomAmount(4, 9) });
        return {
          narrative: 'A pressure trap detonates as you kick, scorching your lead Oozu.',
          outcome: `${creature.nickname} loses ${Math.abs(hpDelta)} HP.`,
          effects: { hp: hpDelta, target: creature.nickname }
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Snatch the sealed vial',
      resolve: () => {
        const itemPool = game.listItems().filter((item) => item.type?.toLowerCase() === 'consumable');
        const chosen = pickRandom(itemPool);
        if (chosen) {
          addInventoryItem(profile, chosen.itemId);
          return {
            narrative: 'You retrieve a sealed vial padded in straw.',
            outcome: `You obtain **${chosen.name}**.`,
            effects: { item: chosen.itemId, delta: 1 }
          };
        }
        return {
          narrative: 'The vial inside has spoiled, crumbling at your touch.',
          outcome: 'No usable item remains.',
          effects: {}
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Tap the barrel to test it',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          const amount = resolveCurrencyGain(profile, randomAmount(3, 8));
          return {
            narrative: 'Loose coins rattle free from the barrel’s seams.',
            outcome: `You gather ${amount} Oozorbs.`,
            effects: { currency: amount }
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const mpDelta = adjustMp({ game, creature, template, delta: -randomAmount(3, 6) });
        return {
          narrative: 'A siphoning rune flares, draining arcana from your companion.',
          outcome: `${creature.nickname} loses ${Math.abs(mpDelta)} MP.`,
          effects: { mp: mpDelta, target: creature.nickname }
        };
      }
    })
  ],
  chest: [
    ({ profile }) => ({
      label: 'Pick the lock carefully',
      resolve: () => {
        const amount = resolveCurrencyGain(profile, randomAmount(15, 30));
        return {
          narrative: 'Your steady hands work the tumblers loose, revealing neatly stacked Oozorbs.',
          outcome: `You gain ${amount} Oozorbs.`,
          effects: { currency: amount }
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Force the chest open',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          return {
            narrative: 'A mimic lunges, but without an Oozu to bite it loses interest.',
            outcome: 'You dodge without harm.',
            effects: {}
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const hpDelta = adjustHp({ game, creature, template, delta: -randomAmount(6, 12) });
        const staminaLoss = Math.min(1, profile.stamina);
        profile.stamina -= staminaLoss;
        return {
          narrative: 'A mimic maw snaps shut on your Oozu before you wrench it free.',
          outcome: `${creature.nickname} loses ${Math.abs(hpDelta)} HP and you lose ${staminaLoss} stamina.`,
          effects: { hp: hpDelta, stamina: -staminaLoss, target: creature.nickname }
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Channel healing light inside',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          const amount = resolveCurrencyGain(profile, randomAmount(10, 16));
          return {
            narrative: 'The chest reflects the light into motes of coin.',
            outcome: `You gain ${amount} Oozorbs.`,
            effects: { currency: amount }
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const hpDelta = adjustHp({ game, creature, template, delta: randomAmount(5, 10) });
        const mpDelta = adjustMp({ game, creature, template, delta: randomAmount(4, 7) });
        return {
          narrative: 'Radiant energy flows from the chest, knitting wounds and refilling arcana.',
          outcome: `${creature.nickname} recovers ${hpDelta} HP and ${mpDelta} MP.`,
          effects: { hp: hpDelta, mp: mpDelta, target: creature.nickname }
        };
      }
    }),
    ({ profile }) => ({
      label: 'Leave a tithe and back away',
      resolve: () => {
        const payment = resolveCurrencyLoss(profile, randomAmount(5, 9));
        return {
          narrative: 'You leave a respectful offering, hoping for favor on future hunts.',
          outcome:
            payment < 0 ? `You spend ${Math.abs(payment)} Oozorbs to appease the spirits.` : 'You had nothing to offer.',
          effects: payment < 0 ? { currency: payment } : {}
        };
      }
    })
  ],
  crate: [
    ({ profile }) => ({
      label: 'Pay off lurking bandits',
      resolve: () => {
        const amount = resolveCurrencyLoss(profile, randomAmount(6, 14));
        return {
          narrative: 'Hidden bandits step out, demanding their cut. You toss them a handful of orbs.',
          outcome: `You lose ${Math.abs(amount)} Oozorbs.`,
          effects: { currency: amount }
        };
      }
    }),
    ({ profile }) => ({
      label: 'Take a breather on the crate',
      resolve: () => {
        const staminaGain = profile.stamina >= profile.maxStamina ? 0 : 1;
        profile.stamina = Math.min(profile.maxStamina, profile.stamina + staminaGain);
        return {
          narrative: 'You sit on the crate and share rations, taking a brief respite.',
          outcome:
            staminaGain > 0 ? 'You regain 1 stamina.' : 'You already feel fully rested.',
          effects: staminaGain > 0 ? { stamina: staminaGain } : {}
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Rummage through the packing straw',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          return {
            narrative: 'The crate is mostly straw and empty jars.',
            outcome: 'Nothing of value turns up.',
            effects: {}
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const mpDelta = adjustMp({ game, creature, template, delta: randomAmount(5, 9) });
        return {
          narrative: 'You uncover an intact ether vial nestled in the straw.',
          outcome: `${creature.nickname} regains ${mpDelta} MP.`,
          effects: { mp: mpDelta, target: creature.nickname }
        };
      }
    }),
    ({ profile }) => ({
      label: 'Salvage spare parts',
      resolve: () => {
        const loot = sampleInventoryItem(profile);
        if (!loot) {
          return {
            narrative: 'You gather a few scraps but nothing useful.',
            outcome: 'Your supplies remain unchanged.',
            effects: {}
          };
        }
        const removed = removeInventoryItem(profile, loot.itemId);
        if (!removed) {
          return {
            narrative: 'Your salvaging fails to damage any gear.',
            outcome: 'Your supplies remain intact.',
            effects: {}
          };
        }
        return {
          narrative: 'A crate collapses, crushing one of your packed supplies.',
          outcome: `You lose one **${loot.itemId}**.`,
          effects: { item: loot.itemId, delta: -1 }
        };
      }
    })
  ],
  shady_trader: [
    ({ profile, game }) => ({
      label: 'Purchase a curious trinket',
      resolve: () => {
        const itemPool = game.listItems().filter((item) => item.type?.toLowerCase() !== 'held');
        const chosen = pickRandom(itemPool);
        const cost = randomAmount(8, 16);
        const current = Math.max(0, Math.floor(profile.currency));
        if (current < cost || !chosen) {
          return {
            narrative: 'You hesitate too long and the trader shrugs, pocketing their wares.',
            outcome: 'No deal is made.',
            effects: {}
          };
        }
        profile.currency = current - cost;
        addInventoryItem(profile, chosen.itemId);
        return {
          narrative: 'You barter for a bottled concoction the trader swears by.',
          outcome: `You spend ${cost} Oozorbs and receive **${chosen.name}**.`,
          effects: { currency: -cost, item: chosen.itemId, delta: 1 }
        };
      }
    }),
    ({ profile }) => ({
      label: 'Guard your belongings',
      resolve: () => {
        const loot = sampleInventoryItem(profile);
        if (!loot) {
          const amount = resolveCurrencyGain(profile, randomAmount(5, 10));
          return {
            narrative: 'With nothing to swipe, the trader slips you a hush fee.',
            outcome: `You gain ${amount} Oozorbs.`,
            effects: { currency: amount }
          };
        }
        removeInventoryItem(profile, loot.itemId);
        const amount = resolveCurrencyGain(profile, randomAmount(3, 6));
        return {
          narrative: 'Despite your vigilance, the trader palms a supply, leaving a few coins in return.',
          outcome: `You lose one **${loot.itemId}** but gain ${amount} Oozorbs.`,
          effects: { item: loot.itemId, delta: -1, currency: amount }
        };
      }
    }),
    ({ profile, game }) => ({
      label: 'Pay for field treatment',
      resolve: () => {
        const selection = resolveRandomOozu(profile);
        if (!selection) {
          const cost = resolveCurrencyLoss(profile, randomAmount(6, 12));
          return {
            narrative: 'With no patients, the trader simply pockets your consultation fee.',
            outcome: `You lose ${Math.abs(cost)} Oozorbs.`,
            effects: { currency: cost }
          };
        }
        const { creature } = selection;
        const template = game.getTemplate(creature.templateId);
        const hpDelta = adjustHp({ game, creature, template, delta: randomAmount(4, 8) });
        const mpDelta = adjustMp({ game, creature, template, delta: randomAmount(4, 8) });
        const cost = randomAmount(5, 9);
        const currencyDelta = resolveCurrencyLoss(profile, cost);
        return {
          narrative: 'The trader mixes salves and tonics tailored to your companion.',
          outcome: `${creature.nickname} recovers ${hpDelta} HP and ${mpDelta} MP for ${Math.abs(currencyDelta)} Oozorbs.`,
          effects: { hp: hpDelta, mp: mpDelta, target: creature.nickname, currency: currencyDelta }
        };
      }
    }),
    ({ profile }) => ({
      label: 'Intimidate the trader',
      resolve: () => {
        const amount = resolveCurrencyGain(profile, randomAmount(6, 11));
        return {
          narrative: 'You glare until the trader coughs up a bribe to keep the peace.',
          outcome: `You gain ${amount} Oozorbs.`,
          effects: { currency: amount }
        };
      }
    })
  ]
};

const EVENT_OUTCOMES = {
  oozu: ({ profile, game }) => {
    const reward = resolveCurrencyGain(profile, randomAmount(35, 55));
    return {
      narrative: 'You corner the elusive quarry. Your traps spring shut in a flurry of motion.',
      outcome: `You destroy the wild Oozu and harvest ${reward} Oozorbs.`,
      effects: { currency: reward }
    };
  }
};
