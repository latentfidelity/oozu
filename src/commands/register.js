import { SlashCommandBuilder } from 'discord.js';

import { buildProfileEmbed } from './util.js';

export const registerCommand = {
  name: 'register',
  slashData: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Join the Oozu arena.'),

  async handleInteraction(interaction, { game }) {
    const displayName =
      interaction.member?.displayName ??
      interaction.user.globalName ??
      interaction.user.username;
    const profile = await game.getOrRegisterPlayer(interaction.user.id, displayName);
    const embed = buildProfileEmbed(profile, game, { title: 'Welcome to the Oozu Arena!' });
    await interaction.reply({ embeds: [embed] });
  },

  async handleMessage(message, _args, { game }) {
    const displayName =
      message.member?.displayName ?? message.author.globalName ?? message.author.username;
    const profile = await game.getOrRegisterPlayer(message.author.id, displayName);
    const embed = buildProfileEmbed(profile, game, { title: 'Welcome to the Oozu Arena!' });
    await message.reply({ embeds: [embed] });
  }
};
