import { readFile, writeFile } from 'fs/promises';

import { PlayerOozu, PlayerProfile } from '../game/models.js';

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
              experience: creature.experience ?? 0
            })
        ) ?? [];

      players.set(
        userId,
        new PlayerProfile({
          userId,
          displayName: entry.display_name ?? entry.displayName,
          playerClass: entry.player_class ?? entry.playerClass ?? null,
          currency: entry.currency ?? 0,
          oozu
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
        currency: profile.currency,
        oozu: profile.oozu.map((creature) => ({
          template_id: creature.templateId,
          nickname: creature.nickname,
          level: creature.level,
          experience: creature.experience
        })),
        player_class: profile.playerClass
      };
    }

    const json = JSON.stringify(payload, null, 2);
    await writeFile(this.path, json, { encoding: 'utf-8' });
  }
}
