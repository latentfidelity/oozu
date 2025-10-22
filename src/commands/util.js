import { EmbedBuilder } from 'discord.js';

const FOOTER_TEXT = 'Oozu prototype build 0.1.0';

export function buildProfileEmbed(profile, game, { title, includeFooter = true }) {
  const embed = new EmbedBuilder().setTitle(title).setColor(randomColor()).addFields(
    { name: 'Player', value: profile.displayName, inline: true },
    { name: 'Class', value: profile.playerClass ?? 'Unassigned', inline: true },
    { name: 'Oozu Collected', value: String(profile.oozu.length), inline: true },
    { name: 'Oozorbs', value: String(profile.currency), inline: true }
  );

  if (includeFooter) {
    embed.setFooter({ text: FOOTER_TEXT });
  }

  return embed;
}

export function buildBattleEmbed(summary, challengerCreature, opponentCreature) {
  const embed = new EmbedBuilder()
    .setTitle(`${summary.challenger} vs ${summary.opponent}`)
    .setDescription(`${summary.winner} takes the win!`)
    .setColor(0xff6b6b)
    .setFooter({ text: FOOTER_TEXT })
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
