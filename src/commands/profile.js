import { SlashCommandBuilder } from 'discord.js';

import { buildProfileEmbed } from './util.js';

export const profileCommand = {
  name: 'profile',
  slashData: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show player profile.'),

  async handleInteraction(interaction, { game }) {
    const profile = game.getPlayer(interaction.user.id);
    if (!profile) {
      await interaction.reply({
        content: 'You are not registered yet. Use `/register` to join!',
        ephemeral: true
      });
      return;
    }

    const embed = buildProfileEmbed(profile, game, { title: 'Your Oozu profile' });
    await interaction.reply({ embeds: [embed], ephemeral: false });
  },

  async handleMessage(message, _args, { game }) {
    const profile = game.getPlayer(message.author.id);
    if (!profile) {
      await message.reply('You are not registered yet. Use `/register` to join!');
      return;
    }

    const embed = buildProfileEmbed(profile, game, { title: 'Your Oozu profile' });
    await message.reply({ embeds: [embed] });
  }
};
