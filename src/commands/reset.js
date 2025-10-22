import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const ADMIN_ROLE_NAME = 'admin';

function isAdmin(member) {
  if (!member?.roles?.cache) {
    return false;
  }
  return member.roles.cache.some((role) => role.name.toLowerCase() === ADMIN_ROLE_NAME);
}

function formatUser(user) {
  return user?.tag ?? user?.username ?? 'Unknown user';
}

async function resolveUserFromArgs(message, args) {
  if (message.mentions.users.size > 0) {
    return message.mentions.users.first();
  }
  const idOrName = args[0];
  if (!idOrName) {
    return null;
  }
  try {
    return await message.client.users.fetch(idOrName);
  } catch {
    return null;
  }
}

export const resetCommand = {
  name: 'reset',
  slashData: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset a player profile back to an unregistered state.')
    .addUserOption((option) =>
      option.setName('player').setDescription('Player to reset.').setRequired(true)
    ),

  async handleInteraction(interaction, { game }) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'You can only run this command inside a server.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!isAdmin(interaction.member)) {
      await interaction.reply({
        content: 'Only Admins can reset players.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const target = interaction.options.getUser('player', true);
    const removed = await game.resetPlayer(target.id);
    const content = removed
      ? `${formatUser(target)} has been reset. They can register again with \`/register\`.`
      : `${formatUser(target)} was not registered.`;

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral
    });
  },

  async handleMessage(message, args, { game }) {
    if (!message.guild) {
      await message.reply('You can only run this command inside a server.');
      return;
    }

    if (!isAdmin(message.member)) {
      await message.reply('Only Admins can reset players.');
      return;
    }

    if (args.length === 0) {
      await message.reply('Usage: !reset @player');
      return;
    }

    const target = await resolveUserFromArgs(message, args);
    if (!target) {
      await message.reply('Could not identify that player.');
      return;
    }

    const removed = await game.resetPlayer(target.id);
    const content = removed
      ? `${formatUser(target)} has been reset. They can register again with \`/register\`.`
      : `${formatUser(target)} was not registered.`;

    await message.reply(content);
  }
};
