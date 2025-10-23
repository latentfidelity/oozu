import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import { randomUUID } from 'crypto';

import { createSpriteAttachment } from '../utils/sprites.js';
import { buildProfileEmbed } from './util.js';

const SMALL_ICON_WIDTH = 64;
const MAX_TEAM_DISPLAY = 6;

export const teamCommand = {
  name: 'team',
  slashData: new SlashCommandBuilder().setName('team').setDescription('Show your active team.'),

  async handleInteraction(interaction, { game }) {
    const profile = game.getPlayer(interaction.user.id);
    if (!profile) {
      await interaction.reply({
        content: 'Register first with `/register` to start collecting.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await interaction.reply({ content: 'Rendering your squad... ⏳' });
      console.log('[team] sent initial reply', interaction.id);
      const response = await buildTeamSummary(profile, game, {
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      console.log('[team] built summary', interaction.id);
      await interaction.editReply(response);
      console.log('[team] edited reply', interaction.id);
    } catch (err) {
      console.error('Failed to build team summary', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: 'Something went wrong while building your squad. Please try again in a moment.',
          embeds: [],
          files: [],
          components: []
        });
      } else {
        throw err;
      }
    }
  },

  async handleMessage(message, _args, { game }) {
    const profile = game.getPlayer(message.author.id);
    if (!profile) {
      await message.reply('Register first with `/register` to start collecting.');
      return;
    }

    const response = await buildTeamSummary(profile, game, {
      avatarURL: message.author.displayAvatarURL?.() ?? message.author.avatarURL?.()
    });
    await message.reply(response);
  },

  async handleComponent(interaction, { game }) {
    const [commandKey, action, ownerId, indexToken] = interaction.customId.split(':');
    if (commandKey !== 'team') {
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the player who ran `/team` can open these sheets.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const profile = game.getPlayer(ownerId);
    if (!profile) {
      await interaction.reply({
        content: 'The player is no longer registered.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const index = Number(indexToken);
    if (!Number.isInteger(index) || index < 0 || index >= profile.oozu.length) {
      await interaction.reply({
        content: 'That Oozu is not available.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const creature = profile.oozu[index];
    const template = game.getTemplate(creature.templateId);
    if (!template) {
      await interaction.reply({
        content: 'Template data missing—try again later.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === 'rename') {
      const modal = new ModalBuilder().setCustomId(`team:rename:${ownerId}:${index}`).setTitle('Rename Oozu');
      const input = new TextInputBuilder()
        .setCustomId('nickname')
        .setLabel('New nickname')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(32)
        .setRequired(true)
        .setValue(creature.nickname.slice(0, 32));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action !== 'view') {
      return;
    }

    try {
      await interaction.reply({ content: 'Opening stat sheet...', flags: MessageFlags.Ephemeral });
      console.log('[team] component acked', interaction.id, 'choice', index);
      const response = await buildStatSheet(profile, creature, template, { index });
      console.log('[team] component built sheet', interaction.id);
      await interaction.editReply(response);
      console.log('[team] component edited reply', interaction.id);
    } catch (err) {
      console.error('Failed to build stat sheet', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: 'Something went wrong while rendering that stat sheet. Please try again later.',
          embeds: [],
          files: [],
          components: []
        });
      } else {
        throw err;
      }
    }
  }
};

teamCommand.handleModal = async function handleTeamModal(interaction, { game }) {
  const [commandKey, action, ownerId, indexToken] = interaction.customId.split(':');
  if (commandKey !== 'team' || action !== 'rename') {
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'Only the player who ran `/team` can rename this Oozu.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const index = Number(indexToken);
  const nickname = interaction.fields.getTextInputValue('nickname')?.trim() ?? '';

  if (!Number.isInteger(index) || index < 0) {
    await interaction.reply({
      content: 'That Oozu is not available.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  try {
    const { profile, creature } = await game.renameOozu({ userId: ownerId, index, nickname });
    const template = game.getTemplate(creature.templateId);
    if (!template) {
      throw new Error('Template data missing—try again later.');
    }
    const response = await buildStatSheet(profile, creature, template, { index });
    const replyPayload = {
      ...response,
      content: `Renamed to **${creature.nickname}**.`,
      flags: MessageFlags.Ephemeral
    };
    await interaction.reply(replyPayload);
    if (interaction.message) {
      await interaction.message
        .edit({
          content: 'Renamed successfully.',
          embeds: [],
          components: [],
          attachments: []
        })
        .catch(() => {});
    }
  } catch (err) {
    await interaction.reply({
      content: err.message ?? 'Failed to rename Oozu.',
      flags: MessageFlags.Ephemeral
    });
  }
};

export async function buildTeamSummary(profile, game, { avatarURL } = {}) {
  const profileEmbed = buildProfileEmbed(profile, game, {
    title: '',
    includeFooter: false,
    avatarURL
  }).setColor(0x4b7bec);

  if (!profile.oozu.length) {
    profileEmbed
      .setDescription('No Oozu yet—use `/register` to receive your starter.')
      .setColor(0x5865f2);
    return {
      content: '',
      embeds: [profileEmbed],
      files: [],
      components: []
    };
  }

  const attachments = [];
  const embeds = [profileEmbed];
  const creatures = profile.oozu.slice(0, MAX_TEAM_DISPLAY);
  const sessionId = randomUUID();

  for (const [idx, creature] of creatures.entries()) {
    const template = game.getTemplate(creature.templateId);
    if (!template) {
      continue;
    }

    const { attachment, fileName } = await createSpriteAttachment(template.sprite, {
      targetWidth: SMALL_ICON_WIDTH,
      variant: `team_${sessionId}_${idx}`
    });
    attachments.push(attachment);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${creature.nickname} • Lv ${creature.level}`,
        iconURL: `attachment://${fileName}`
      })
      .addFields(
        { name: 'Element', value: template.element, inline: true },
        { name: 'Tier', value: template.tier, inline: true },
        { name: 'Item', value: 'None', inline: true }
      )
      .setColor(0x4b7bec)
      .setFooter({ text: 'Select this Oozu to view the full sheet.' });

    embeds.push(embed);
  }

  const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

  const buttons = creatures.map((creature, idx) => {
    const template = game.getTemplate(creature.templateId);
    const templateName = template?.name;
    const label = creature.nickname;
    return new ButtonBuilder()
      .setCustomId(`team:view:${profile.userId}:${idx}`)
      .setLabel(label)
      .setEmoji(numberEmojis[idx + 1] ?? '🔢')
      .setStyle(ButtonStyle.Secondary);
  });

  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    components.push(new ActionRowBuilder().addComponents(rowButtons));
  }

  const response = {
    content: '',
    embeds,
    files: attachments,
    components
  };
  return response;
}

export async function buildStatSheet(profile, creature, template, { index } = {}) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Missing Oozu index for stat sheet rendering.');
  }

  const sessionId = randomUUID();

  const { attachment: iconAttachment, fileName: iconFile } = await createSpriteAttachment(template.sprite, {
    targetWidth: SMALL_ICON_WIDTH,
    variant: `inspect_icon_${sessionId}`
  });

  const { attachment: spriteAttachment, fileName: spriteFile } = await createSpriteAttachment(template.sprite, {
    scale: 1,
    variant: `inspect_full_${sessionId}`
  });

  const movesText =
    template.moves.length > 0
      ? template.moves.map((move) => `• **${move.name}** (${move.power}) — ${move.description}`).join('\n')
      : 'No moves recorded.';

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${creature.nickname} • Lv ${creature.level}`,
      iconURL: `attachment://${iconFile}`
    })
    .setTitle(`${template.name} Stat Sheet`)
    .setDescription(template.description)
    .setColor(0x32a852)
    .addFields(
      { name: 'Player', value: profile.displayName, inline: true },
      { name: 'Element', value: template.element, inline: true },
      { name: 'Tier', value: template.tier, inline: true },
      { name: 'Item', value: 'None', inline: true },
      { name: 'Moves', value: movesText, inline: false }
    )
    .setImage(`attachment://${spriteFile}`);

  const renameButton = new ButtonBuilder()
    .setCustomId(`team:rename:${profile.userId}:${index}`)
    .setLabel('Rename')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    files: [iconAttachment, spriteAttachment],
    components: [new ActionRowBuilder().addComponents(renameButton)]
  };
}
