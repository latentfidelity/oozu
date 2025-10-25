import { readFile, writeFile } from 'fs/promises';

import { PlayerOozu, PlayerProfile, DEFAULT_MAX_STAMINA } from '../game/models.js';

export class JsonStore {
  constructor(path) {
    this.path = path;
  }

  async loadPlayers() {
    let data;
    try {
      data = await readFile(this.path, { encoding: 'utf-8' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return new Map();
      }
      throw err;
    }

    if (!data.trim()) {
      return new Map();
    }

    let raw;
    try {
      raw = JSON.parse(data);
    } catch (err) {
      return new Map();
    }

    const players = new Map();
    for (const [userId, entry] of Object.entries(raw)) {
      const oozu =
        entry.oozu?.map(
          (creature) =>
            new PlayerOozu({
              templateId: creature.template_id ?? creature.templateId,
              nickname: creature.nickname,
              level: creature.level ?? 1,
              experience: creature.experience ?? 0,
              heldItem: creature.held_item ?? creature.heldItem ?? null,
              currentHp: creature.current_hp ?? creature.currentHp ?? null,
              currentMp: creature.current_mp ?? creature.currentMp ?? null
            })
        ) ?? [];

      const maxStamina = entry.max_stamina ?? entry.maxStamina ?? DEFAULT_MAX_STAMINA;
      const stamina =
        entry.stamina ?? entry.current_stamina ?? entry.currentStamina ?? maxStamina ?? DEFAULT_MAX_STAMINA;

      players.set(
        userId,
        new PlayerProfile({
          userId,
          displayName: entry.display_name ?? entry.displayName,
          gender: entry.gender ?? entry.gender_key ?? null,
          pronoun: entry.pronoun ?? entry.preferred_pronoun ?? null,
          playerClass: entry.player_class ?? entry.playerClass ?? null,
          currency: entry.currency ?? 0,
          oozu,
          stamina,
          maxStamina,
          inventory: entry.inventory ?? entry.items ?? null,
          portraitUrl: entry.portrait_url ?? entry.portraitUrl ?? null
        })
      );
    }

    return players;
  }

  async savePlayers(players) {
    const payload = {};
    for (const profile of players) {
      const userId = String(profile.userId);
      payload[userId] = {
        display_name: profile.displayName,
        gender: profile.gender,
        pronoun: profile.pronoun,
        currency: profile.currency,
        stamina: profile.stamina,
        max_stamina: profile.maxStamina,
        oozu: profile.oozu.map((creature) => ({
          template_id: creature.templateId,
          nickname: creature.nickname,
          level: creature.level,
          experience: creature.experience,
          held_item: creature.heldItem,
          current_hp: creature.currentHp,
          current_mp: creature.currentMp
        })),
        player_class: profile.playerClass,
        inventory: Object.fromEntries(profile.inventory.entries()),
        portrait_url: profile.portraitUrl
      };
    }

    const json = JSON.stringify(payload, null, 2);
    await writeFile(this.path, json, { encoding: 'utf-8' });
  }
}
