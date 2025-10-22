import { SlashCommandBuilder } from 'discord.js';

export const pingCommand = {
  name: 'ping',
  slashData: new SlashCommandBuilder().setName('ping').setDescription('Check if Oozu bot is awake.'),

  async handleInteraction(interaction) {
    await interaction.reply({ content: 'Oozu is ready to bounce!', ephemeral: true });
  },

  async handleMessage(message) {
    await message.reply('Oozu is ready to bounce!');
  }
};
