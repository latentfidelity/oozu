import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';

import { buildProfileEmbed } from './util.js';

const CLASS_ACTIONS = new Map(
  Object.entries({
    tamer: {
      label: 'Tame',
      emoji: '🐾',
      flavor: 'You go out taming.'
    },
    hunter: {
      label: 'Hunt',
      emoji: '🏹',
      flavor: 'You go out hunting.'
    },
    alchemist: {
      label: 'Experiment',
      emoji: '⚗️',
      flavor: 'You start a bubbling experiment.'
    }
  })
);

function resolveClassAction(profile) {
  const key = profile.playerClass?.trim().toLowerCase();
  if (!key) {
    return null;
  }
  const action = CLASS_ACTIONS.get(key);
  if (!action) {
    return null;
  }
  return { ...action, key };
}

function buildRootMenu(profile, game, { ownerId, avatarURL }) {
  const embed = buildProfileEmbed(profile, game, {
    title: 'Action Menu',
    avatarURL
  });
  embed.setDescription('Choose an action category to continue.');

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`action:menu:${ownerId}:work`)
        .setLabel('Work')
        .setEmoji('💼')
        .setStyle(ButtonStyle.Primary)
    )
  ];

  return {
    embeds: [embed],
    components: rows
  };
}

function buildWorkMenu(profile, game, { ownerId, avatarURL }) {
  const embed = buildProfileEmbed(profile, game, {
    title: 'Work Assignments',
    avatarURL
  });

  const action = resolveClassAction(profile);
  const hasStamina = Number(profile.stamina) > 0;
  if (action) {
    const status = hasStamina
      ? 'Take on a task aligned with your training.'
      : 'You are out of stamina. Rest before taking on more work.';
    embed.setDescription(`Class: **${profile.playerClass}**\n${status}`);
  } else {
    embed.setDescription('Choose a class with `/register` to unlock work assignments.');
  }

  const rows = [];
  if (action) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action:work:${ownerId}:${action.key}`)
          .setLabel(action.label)
          .setEmoji(action.emoji)
          .setDisabled(!hasStamina)
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`action:menu:${ownerId}:root`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    embeds: [embed],
    components: rows
  };
}

export const actionCommand = {
  name: 'action',
  slashData: new SlashCommandBuilder()
    .setName('action')
    .setDescription('Open the action menu.'),

  async handleInteraction(interaction, { game }) {
    const profile = game.getPlayer(interaction.user.id);
    if (!profile) {
      await interaction.reply({
        content: 'Register first with `/register` to unlock the action menu.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const response = buildRootMenu(profile, game, {
      ownerId: interaction.user.id,
      avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
    });

    await interaction.reply({
      content: 'Select a submenu to begin.',
      ...response,
      flags: MessageFlags.Ephemeral
    });
  },

  async handleMessage(message, _args, { game }) {
    const profile = game.getPlayer(message.author.id);
    if (!profile) {
      await message.reply('Register first with `/register` to unlock the action menu.');
      return;
    }

    const response = buildRootMenu(profile, game, {
      ownerId: message.author.id,
      avatarURL: message.author.displayAvatarURL?.() ?? message.author.avatarURL?.()
    });

    await message.reply({
      content: `${message.author}, select a submenu to begin.`,
      ...response
    });
  },

  async handleComponent(interaction, { game }) {
    const [commandKey, scope, ownerId, detail] = interaction.customId.split(':');
    if (commandKey !== 'action') {
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: 'Only the player who opened this menu can use it.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const profile = game.getPlayer(ownerId);
    if (!profile) {
      await interaction.reply({
        content: 'You no longer have a registered profile. Use `/register` to begin again.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const avatarURL = interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.();

    if (scope === 'menu') {
      if (detail === 'work') {
        const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Focus your efforts on a work assignment.',
          ...response
        });
        return;
      }

      if (detail === 'root') {
        const response = buildRootMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Select a submenu to begin.',
          ...response
        });
        return;
      }
      return;
    }

    if (scope === 'work') {
      const action = resolveClassAction(profile);
      if (!action) {
        const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Choose a class with `/register` to unlock work assignments.',
          ...response
        });
        return;
      }

      if (detail !== action.key) {
        await interaction.reply({
          content: 'That work assignment is not available to you.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        const updatedProfile = await game.spendStamina(ownerId, 1);
        const response = buildWorkMenu(updatedProfile, game, { ownerId, avatarURL });
        await interaction.update({
          content: `${action.flavor} (-1 stamina)`,
          ...response
        });
        return;
      } catch (err) {
        if (err?.message === 'Not enough stamina.') {
          const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
          await interaction.update({
            content: 'You are too exhausted to act.',
            ...response
          });
          return;
        }

        console.error('[action] failed to resolve work action', err);
        const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Something went wrong while taking that action.',
          ...response
        });
        return;
      }
    }
  }
};
