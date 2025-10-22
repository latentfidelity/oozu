import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
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
      const response = await buildTeamSummary(profile, game);
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

    const response = await buildTeamSummary(profile, game);
    await message.reply(response);
  },

  async handleComponent(interaction, { game }) {
    const [commandKey, action, ownerId, indexToken] = interaction.customId.split(':');
    if (commandKey !== 'team' || action !== 'view') {
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "Only the trainer who ran `/team` can open these sheets.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const profile = game.getPlayer(ownerId);
    if (!profile) {
      await interaction.reply({
        content: 'The trainer is no longer registered.',
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

    try {
      await interaction.reply({ content: 'Opening stat sheet...', flags: MessageFlags.Ephemeral });
      console.log('[team] component acked', interaction.id, 'choice', index);
      const response = await buildStatSheet(profile, creature, template);
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

export async function buildTeamSummary(profile, game) {
  const profileEmbed = buildProfileEmbed(profile, game, { title: 'Team Profile' })
    .setColor(0x4b7bec)
    .setFooter({ text: 'Oozu prototype build 0.1.0' });

  if (!profile.oozu.length) {
    profileEmbed
      .setDescription('No Oozu yet—use `/register` to receive your starter.')
      .setColor(0x5865f2);
    return {
      content: `${profile.displayName} • Oozorbs: ${profile.currency}`,
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
      .setDescription(`Element: ${template.element}\nTier: ${template.tier}`)
      .setColor(0x4b7bec)
      .setFooter({ text: 'Select this Oozu to view the full sheet.' });

    embeds.push(embed);
  }

  const buttons = creatures.map((creature, idx) => {
    const template = game.getTemplate(creature.templateId);
    const templateName = template?.name;
    const label =
      templateName && templateName !== creature.nickname ? `${creature.nickname} (${templateName})` : creature.nickname;
    return new ButtonBuilder()
      .setCustomId(`team:view:${profile.userId}:${idx}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary);
  });

  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    components.push(new ActionRowBuilder().addComponents(rowButtons));
  }

  const response = {
    content: `${profile.displayName} • Oozorbs: ${profile.currency}`,
    embeds,
    files: attachments,
    components
  };
  return response;
}

export async function buildStatSheet(profile, creature, template) {
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
      { name: 'Trainer', value: profile.displayName, inline: true },
      { name: 'Element', value: template.element, inline: true },
      { name: 'Tier', value: template.tier, inline: true },
      {
        name: 'Base Stats',
        value: `HP ${template.baseHp}\nATK ${template.baseAttack}\nDEF ${template.baseDefense}`,
        inline: true
      },
      { name: 'Oozorbs', value: String(profile.currency), inline: true },
      { name: 'Moves', value: movesText, inline: false }
    )
    .setImage(`attachment://${spriteFile}`)
    .setFooter({ text: 'Oozu prototype build 0.1.0' });

  return {
    embeds: [embed],
    files: [iconAttachment, spriteAttachment]
  };
}
