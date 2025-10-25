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

function renderHeldItem(game, creature) {
  if (!creature?.heldItem) {
    return 'None';
  }
  return game.getItem(creature.heldItem)?.name ?? creature.heldItem;
}

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
      await interaction.reply({
        content: 'Rendering your squad... ⏳',
        flags: MessageFlags.Ephemeral
      });
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

    if (action === 'summary') {
      const response = await buildTeamSummary(profile, game, {
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.update({ ...response, attachments: [] });
      return;
    }

    if (action === 'player') {
      const response = buildPlayerSheet(profile, game, {
        ownerId,
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.update(response);
      return;
    }

    if (action === 'portrait') {
      const modal = new ModalBuilder().setCustomId(`team:portrait:${ownerId}`).setTitle('Update Portrait');
      const input = new TextInputBuilder()
        .setCustomId('portrait_url')
        .setLabel('Image URL (leave blank to clear)')
        .setPlaceholder('https://example.com/image.png')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(512);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action !== 'view' && action !== 'rename') {
      return;
    }

    const index = Number(indexToken);
    if (!Number.isInteger(index) || index < 0 || index >= profile.oozu.length) {
      const summary = await buildTeamSummary(profile, game, {
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.update({
        ...summary,
        content: 'That Oozu is not available.'
      });
      return;
    }

    const creature = profile.oozu[index];
    const template = game.getTemplate(creature.templateId);
    if (!template) {
      const summary = await buildTeamSummary(profile, game, {
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.update({
        ...summary,
        content: 'Template data missing—try again later.'
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
      await interaction.deferUpdate();
    } catch (err) {
      console.error('Failed to defer stat sheet update', err);
      return;
    }

    try {
      const response = await buildStatSheet(profile, creature, template, {
        index,
        ownerId,
        game
      });
      console.log('[team] component built sheet', interaction.id);
      await interaction.editReply({ ...response, attachments: [] });
      console.log('[team] component updated reply', interaction.id);
    } catch (err) {
      console.error('Failed to build stat sheet', err);
      const summary = await buildTeamSummary(profile, game, {
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.editReply({
        ...summary,
        content: 'Something went wrong while rendering that stat sheet. Please try again later.',
        attachments: []
      });
    }
  }
};

teamCommand.handleModal = async function handleTeamModal(interaction, { game }) {
  const [commandKey, action, ownerId, indexToken] = interaction.customId.split(':');
  if (commandKey !== 'team') {
    return;
  }

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'Only the player who ran `/team` can update this information.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'portrait') {
    const rawUrl = interaction.fields.getTextInputValue('portrait_url') ?? '';
    let portraitUrl = rawUrl.trim();

    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('Failed to defer portrait modal update', err);
      return;
    }

    try {
      const updatedProfile = await game.setPlayerPortrait({
        userId: ownerId,
        portraitUrl
      });
      const response = buildPlayerSheet(updatedProfile, game, {
        ownerId,
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      if (interaction.message) {
        await interaction.message.edit(response);
      }
    } catch (err) {
      console.error('Failed to update portrait', err);
      await interaction.followUp({
        content: err.message ?? 'Failed to update portrait.',
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }

  if (action !== 'rename') {
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
    await interaction.deferUpdate();
  } catch (err) {
    console.error('Failed to defer rename modal update', err);
    return;
  }

  try {
    const { profile, creature } = await game.renameOozu({ userId: ownerId, index, nickname });
    const template = game.getTemplate(creature.templateId);
    if (!template) {
      throw new Error('Template data missing—try again later.');
    }
    const response = await buildStatSheet(profile, creature, template, { index, ownerId, game });
    if (interaction.message) {
      await interaction.message.edit(response);
    }
  } catch (err) {
    console.error('Failed to rename Oozu', err);
    if (interaction.message) {
      try {
        const fallbackProfile = game.getPlayer(ownerId);
        if (fallbackProfile) {
          const summary = await buildTeamSummary(fallbackProfile, game, {
            avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
          });
          await interaction.message.edit({
            ...summary,
            content: err.message ?? 'Failed to rename Oozu.'
          });
        } else {
          await interaction.message.edit({
            content: err.message ?? 'Failed to rename Oozu.',
            embeds: [],
            components: [],
            files: [],
            attachments: []
          });
        }
      } catch {
        /* ignore follow-up edit errors */
      }
    }
  }
};

export async function buildTeamSummary(profile, game, { avatarURL } = {}) {
  const profileEmbed = buildProfileEmbed(profile, game, {
    title: '',
    includeFooter: false,
    avatarURL,
    includeInventory: false
  }).setColor(0x4b7bec);

  if (!profile.oozu.length) {
    profileEmbed
      .setDescription('No Oozu yet—use `/register` to receive your starter.')
      .setColor(0x5865f2);
    return {
      content: '',
      embeds: [profileEmbed],
      files: [],
      components: [],
      attachments: []
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
        { name: 'Item', value: renderHeldItem(game, creature), inline: true }
      )
      .setColor(0x4b7bec)
      .setFooter({ text: 'Select this Oozu to view the full sheet.' });

    embeds.push(embed);
  }

  const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

  const playerButton = new ButtonBuilder()
    .setCustomId(`team:player:${profile.userId}`)
    .setLabel(profile.displayName)
    .setEmoji('👤')
    .setStyle(ButtonStyle.Secondary);

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

  const components = [new ActionRowBuilder().addComponents(playerButton)];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    components.push(new ActionRowBuilder().addComponents(rowButtons));
  }

  return {
    content: '',
    embeds,
    files: attachments,
    components,
    attachments: []
  };
}

export async function buildStatSheet(profile, creature, template, { index, ownerId, game } = {}) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Missing Oozu index for stat sheet rendering.');
  }

  if (!game) {
    throw new Error('Missing game context for stat sheet rendering.');
  }

  const sessionId = randomUUID();
  const maxHp = Math.max(0, Math.floor(game.calculateHp(template, creature.level)));
  const maxMp = Math.max(0, Math.floor(game.calculateMp(template, creature.level)));
  const attack = Math.floor(game.calculateAttack(template, creature.level));
  const defense = Math.floor(game.calculateDefense(template, creature.level));
  const currentHp = Math.max(0, Math.min(Number.isFinite(creature.currentHp) ? Math.floor(creature.currentHp) : maxHp, maxHp));
  const currentMp = Math.max(0, Math.min(Number.isFinite(creature.currentMp) ? Math.floor(creature.currentMp) : maxMp, maxMp));
  const experience = Math.max(0, Math.floor(creature.experience ?? 0));

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
    .setTitle(template.name)
    .setDescription(template.description)
    .setColor(0x32a852)
    .addFields(
      { name: 'Player', value: profile.displayName, inline: true },
      { name: 'Element', value: template.element, inline: true },
      { name: 'Tier', value: template.tier, inline: true },
      { name: 'HP', value: `${currentHp}/${maxHp}`, inline: true },
      { name: 'Attack', value: String(attack), inline: true },
      { name: 'Defense', value: String(defense), inline: true },
      { name: 'MP', value: `${currentMp}/${maxMp}`, inline: true },
      { name: 'Experience', value: String(experience), inline: true },
      { name: 'Item', value: renderHeldItem(game, creature), inline: true },
      { name: 'Moves', value: movesText, inline: false }
    )
    .setImage(`attachment://${spriteFile}`);

  const targetOwnerId = ownerId ?? profile.userId;

  const renameButton = new ButtonBuilder()
    .setCustomId(`team:rename:${profile.userId}:${index}`)
    .setLabel('Rename')
    .setStyle(ButtonStyle.Secondary);

  const backButton = new ButtonBuilder()
    .setCustomId(`team:summary:${targetOwnerId}`)
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder().addComponents(renameButton, backButton);

  return {
    content: '',
    embeds: [embed],
    files: [iconAttachment, spriteAttachment],
    components: [actionRow],
    attachments: []
  };
}

function buildPlayerSheet(profile, game, { ownerId, avatarURL } = {}) {
  const embed = buildProfileEmbed(profile, game, {
    title: 'Player Overview',
    avatarURL,
    includeInventory: false
  });

  if (profile.portraitUrl) {
    embed.setImage(profile.portraitUrl);
  } else {
    embed.addFields({ name: 'Portrait', value: 'No portrait set. Use Change Portrait to add one.', inline: false });
  }

  const inventoryButton = new ButtonBuilder()
    .setCustomId(`items:menu:${ownerId}:open`)
    .setLabel('Open Inventory')
    .setEmoji('🎒')
    .setStyle(ButtonStyle.Primary);

  const portraitButton = new ButtonBuilder()
    .setCustomId(`team:portrait:${ownerId}`)
    .setLabel(profile.portraitUrl ? 'Change Portrait' : 'Set Portrait')
    .setEmoji('🖼️')
    .setStyle(ButtonStyle.Secondary);

  const backButton = new ButtonBuilder()
    .setCustomId(`team:summary:${ownerId}`)
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);

  const components = [new ActionRowBuilder().addComponents(inventoryButton, portraitButton, backButton)];

  return {
    content: '',
    embeds: [embed],
    components,
    files: [],
    attachments: []
  };
}
