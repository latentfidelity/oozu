import { EmbedBuilder } from 'discord.js';

import { DEFAULT_MAX_STAMINA } from '../game/models.js';

export function buildProfileEmbed(profile, game, { title = '', includeFooter = true, avatarURL, includeInventory = true } = {}) {
  const embed = new EmbedBuilder().setColor(randomColor());

  if (title) {
    embed.setTitle(title);
  }

  const inventoryEntries = profile.inventoryEntries?.() ?? [];
  const totalItems = inventoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const uniqueItems = inventoryEntries.length;
  const inventorySummary = uniqueItems === 0 ? 'Empty' : `${totalItems} total (${uniqueItems} types)`;

  embed
    .setAuthor({
      name: `${profile.displayName} • Lv ${resolvePlayerLevel(profile)}`,
      iconURL: avatarURL ?? undefined
    })
    .addFields(
      { name: 'Gender', value: profile.gender ?? 'Unspecified', inline: true },
      { name: 'Class', value: profile.playerClass ?? 'Unassigned', inline: true },
      { name: 'Stamina', value: renderStamina(profile), inline: true },
      { name: 'Oozorbs', value: String(profile.currency), inline: true }
    );

  if (includeInventory) {
    embed.addFields({ name: 'Items', value: inventorySummary, inline: true });
  }

  return embed;
}

export function buildBattleEmbed(summary, challengerCreature, opponentCreature) {
  const embed = new EmbedBuilder()
    .setTitle(`${summary.challenger} vs ${summary.opponent}`)
    .setDescription(`${summary.winner} takes the win!`)
    .setColor(0xff6b6b)
    .addFields(
      { name: 'Challenger Oozu', value: challengerCreature, inline: true },
      { name: 'Opponent Oozu', value: opponentCreature, inline: true },
      { name: 'Rounds', value: String(summary.rounds), inline: true }
    );

  if (summary.log.length > 0) {
    const entries = summary.log
      .slice(0, 10)
      .map((entry) => `${entry.actor} ${entry.action} for ${entry.value} dmg`)
      .join('\n');
    embed.addFields({ name: 'Battle Log', value: entries, inline: false });
  }

  return embed;
}

function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

function renderStamina(profile) {
  const max = Number.isFinite(profile.maxStamina) && profile.maxStamina > 0 ? profile.maxStamina : DEFAULT_MAX_STAMINA;
  const current = Number.isFinite(profile.stamina) ? Math.max(0, Math.min(profile.stamina, max)) : max;
  const filled = '■'.repeat(current);
  const empty = '□'.repeat(Math.max(0, max - current));
  return filled + empty;
}

function resolvePlayerLevel(profile) {
  if (!Array.isArray(profile.oozu) || profile.oozu.length === 0) {
    return 1;
  }
  let maxLevel = 1;
  for (const creature of profile.oozu) {
    const level = Number.isFinite(creature.level) ? Number(creature.level) : 1;
    if (level > maxLevel) {
      maxLevel = level;
    }
  }
  return Math.max(1, maxLevel);
}
