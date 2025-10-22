import { SlashCommandBuilder } from 'discord.js';

import { buildBattleEmbed } from './util.js';

export const battleCommand = {
  name: 'battle',
  slashData: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Challenge another trainer to a friendly Oozu skirmish.')
    .addUserOption((option) =>
      option.setName('opponent').setDescription('Trainer you want to battle.').setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('my_oozu')
        .setDescription('Nickname of the Oozu you want to battle with.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('their_oozu')
        .setDescription("Nickname of your opponent's Oozu to battle.")
        .setRequired(false)
    ),

  async handleInteraction(interaction, { game }) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'Battles only work inside a server.',
        ephemeral: true
      });
      return;
    }

    const opponentUser = interaction.options.getUser('opponent', true);
    if (opponentUser.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't battle yourself—ask a friend!",
        ephemeral: true
      });
      return;
    }

    const challengerProfile = game.getPlayer(interaction.user.id);
    if (!challengerProfile) {
      await interaction.reply({
        content: 'Register first with `/register`.',
        ephemeral: true
      });
      return;
    }

    const opponentProfile = game.getPlayer(opponentUser.id);
    if (!opponentProfile) {
      const mention = interaction.guild.members.resolve(opponentUser)?.toString() ?? opponentUser.tag;
      await interaction.reply({
        content: `${mention} has not registered yet.`,
        ephemeral: true
      });
      return;
    }

    const myNickname = interaction.options.getString('my_oozu');
    const theirNickname = interaction.options.getString('their_oozu');

    let challengerCreature;
    let opponentCreature;
    try {
      challengerCreature = resolveCreature(challengerProfile, myNickname);
      opponentCreature = resolveCreature(opponentProfile, theirNickname);
    } catch (err) {
      await interaction.reply({ content: String(err.message ?? err), ephemeral: true });
      return;
    }

    const summary = await game.battle({
      challenger: challengerProfile,
      challengerOozu: challengerCreature,
      opponent: opponentProfile,
      opponentOozu: opponentCreature
    });

    const embed = buildBattleEmbed(summary, challengerCreature.nickname, opponentCreature.nickname);
    await interaction.reply({ embeds: [embed] });
  },

  async handleMessage(message, args, { game }) {
    if (!message.guild) {
      await message.reply('Battles only work inside a server.');
      return;
    }

    if (args.length === 0) {
      await message.reply(
        'Usage: !battle @opponent [my_oozu] [their_oozu]'
      );
      return;
    }

    const opponentArg = args[0];
    const opponentUser = await resolveOpponentUser(message, opponentArg);
    if (!opponentUser) {
      await message.reply('Could not determine the opponent. Mention them or provide an ID.');
      return;
    }

    if (opponentUser.id === message.author.id) {
      await message.reply("You can't battle yourself—ask a friend!");
      return;
    }

    const challengerProfile = game.getPlayer(message.author.id);
    if (!challengerProfile) {
      await message.reply('Register first with `/register`.');
      return;
    }

    const opponentProfile = game.getPlayer(opponentUser.id);
    if (!opponentProfile) {
      await message.reply(`${opponentUser} has not registered yet.`);
      return;
    }

    const myNickname = args[1];
    const theirNickname = args[2];

    let challengerCreature;
    let opponentCreature;
    try {
      challengerCreature = resolveCreature(challengerProfile, myNickname);
      opponentCreature = resolveCreature(opponentProfile, theirNickname);
    } catch (err) {
      await message.reply(String(err.message ?? err));
      return;
    }

    const summary = await game.battle({
      challenger: challengerProfile,
      challengerOozu: challengerCreature,
      opponent: opponentProfile,
      opponentOozu: opponentCreature
    });

    const embed = buildBattleEmbed(summary, challengerCreature.nickname, opponentCreature.nickname);
    await message.reply({ embeds: [embed] });
  }
};

function resolveCreature(profile, nickname) {
  if (profile.oozu.length === 0) {
    throw new Error('No Oozu available for battle.');
  }

  if (!nickname) {
    return profile.oozu[0];
  }

  const creature = profile.findOozu(nickname);
  if (creature) {
    return creature;
  }

  throw new Error(`${profile.displayName} does not own \`${nickname}\`.`);
}

async function resolveOpponentUser(message, arg) {
  const mention = message.mentions.users.first();
  if (mention) {
    return mention;
  }

  const id = arg.replace(/[<@!>]/g, '');
  if (!id) {
    return null;
  }

  return (
    message.client.users.cache.get(id) ??
    (await message.client.users.fetch(id).catch(() => null))
  );
}
