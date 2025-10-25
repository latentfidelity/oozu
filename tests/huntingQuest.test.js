import { describe, it, beforeAll, expect } from 'vitest';
import { join } from 'path';

import { GameService } from '../src/game/gameService.js';
import { PlayerProfile, PlayerOozu } from '../src/game/models.js';

class MemoryStore {
  constructor(initialProfiles = new Map()) {
    this.current = new Map(initialProfiles);
  }

  async loadPlayers() {
    return new Map(this.current);
  }

  async savePlayers(profiles) {
    const updated = new Map();
    for (const profile of profiles) {
      updated.set(profile.userId, profile);
    }
    this.current = updated;
  }
}

describe('Hunting quests', () => {
  const userId = 'tester';
  let game;

  beforeAll(async () => {
    const templateFile = join(process.cwd(), 'data/oozu_templates.json');
    const itemsFile = join(process.cwd(), 'data/items.json');

    const initialProfile = new PlayerProfile({
      userId,
      displayName: 'Test Hunter',
      playerClass: 'Hunter',
      stamina: 5,
      currency: 100,
      oozu: [
        new PlayerOozu({
          templateId: 'water_oozu',
          nickname: 'Wave',
          level: 5,
          currentHp: 30,
          currentMp: 15
        })
      ]
    });

    const store = new MemoryStore(new Map([[userId, initialProfile]]));
    game = new GameService({
      store,
      templateFile,
      itemsFile
    });
    await game.initialize();
  });

  it('starts a hunting quest with an initial event', async () => {
    const result = await game.startHuntingQuest(userId);
    expect(result.quest.stage).toBe(0);
    expect(result.quest.status).toBe('ongoing');
    expect(result.quest.log.length).toBe(0);
    expect(result.pendingEvent).toBeTruthy();
    expect(result.eventOptions.length).toBe(3);
    expect(result.pendingEvent.scene).toBeTruthy();
    expect(result.pendingEvent.sprite).toBeTruthy();
  });

  it('advances through choices and reaches the finale', async () => {
    let questState = await game.startHuntingQuest(userId);
    let safety = 0;
    while (questState.quest.status !== 'complete' && safety < 20) {
      if (questState.pendingEvent) {
        expect(questState.eventOptions.length).toBe(3);
        const action = questState.eventOptions[0];
        questState = await game.resolveHuntingEventAction({
          userId,
          questId: questState.quest.id,
          optionId: action.id
        });
      } else if (questState.quest.status === 'awaiting_finale') {
        questState = await game.completeHuntingQuestFinale({ userId, questId: questState.quest.id });
      } else {
        expect(questState.pathOptions.length).toBeGreaterThan(0);
        const choice = questState.pathOptions[0];
        questState = await game.chooseHuntingQuestOption({
          userId,
          questId: questState.quest.id,
          optionId: choice.id
        });
      }
      safety += 1;
    }

    expect(questState.quest.status).toBe('complete');
    expect(questState.quest.log.length).toBeGreaterThanOrEqual(3);
    expect(questState.quest.log.length).toBeLessThanOrEqual(7);
    expect(questState.pathOptions.length).toBe(0);
    const finale = questState.latest ?? questState.quest.log.at(-1);
    expect(finale.scene).toBeTruthy();
    expect(finale.sprite).toBeTruthy();
  });
});
