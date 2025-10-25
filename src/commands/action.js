import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';

import { buildProfileEmbed } from './util.js';
import { composeQuestScene } from '../utils/questScenes.js';

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

function buildQuestEmbed(profile, quest, latest, pendingEvent, { avatarURL }) {
  const status = quest.status === 'complete' ? 'Complete' : 'In Progress';
  const embed = new EmbedBuilder()
    .setTitle('Hunting Quest')
    .setColor(0x5fb763)
    .setAuthor({
      name: profile.displayName,
      iconURL: avatarURL ?? undefined
    })
    .setDescription(`Type: **${quest.type}**\nSubtype: **${quest.subtype}**`)
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Stamina', value: `${profile.stamina}/${profile.maxStamina}`, inline: true },
      { name: 'Oozorbs', value: String(profile.currency), inline: true }
    );

  if (pendingEvent) {
    embed.addFields({
      name: pendingEvent.title,
      value: pendingEvent.prompt.slice(0, 1024),
      inline: false
    });
  }

  if (latest) {
    const narrative = [latest.narrative, latest.outcome].filter(Boolean).join('\n');
    if (narrative) {
      embed.addFields({
        name: latest.title,
        value: narrative.slice(0, 1024),
        inline: false
      });
    }
  }

  const previous = quest.log
    .filter((entry) => !latest || entry.index !== latest.index)
    .slice(-2);
  if (previous.length > 0) {
    const summary = previous.map((entry) => `• ${entry.title}: ${entry.outcome}`).join('\n');
    embed.addFields({
      name: 'Recent Events',
      value: summary.slice(0, 1024),
      inline: false
    });
  }

  return embed;
}

function buildQuestComponents(ownerId, quest, { eventOptions = [], pathOptions = [] }) {
  const rows = [];
  if (eventOptions.length > 0) {
    const buttons = eventOptions.map((option) =>
      new ButtonBuilder()
        .setCustomId(`action:quest:${ownerId}:event:${quest.id}:${option.id}`)
        .setLabel(option.label)
        .setStyle(ButtonStyle.Primary)
    );
    rows.push(new ActionRowBuilder().addComponents(...buttons));
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action:quest:${ownerId}:back:${quest.id}`)
          .setLabel('Retreat to Work')
          .setStyle(ButtonStyle.Secondary)
      )
    );
    return rows;
  }

  if (quest.status === 'awaiting_finale') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action:quest:${ownerId}:finale:${quest.id}`)
          .setLabel('Confront the Quarry')
          .setStyle(ButtonStyle.Danger)
      )
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action:quest:${ownerId}:back:${quest.id}`)
          .setLabel('Return to Work')
          .setStyle(ButtonStyle.Secondary)
      )
    );
    return rows;
  }

  if (quest.status === 'ongoing' && pathOptions.length > 0) {
    const buttons = pathOptions.map((option) =>
      new ButtonBuilder()
        .setCustomId(`action:quest:${ownerId}:choose:${quest.id}:${option.id}`)
        .setLabel(option.hidden ? '???' : option.label)
        .setStyle(option.hidden ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );
    rows.push(new ActionRowBuilder().addComponents(...buttons));
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`action:quest:${ownerId}:back:${quest.id}`)
          .setLabel('Back to Work')
          .setStyle(ButtonStyle.Secondary)
      )
    );
    return rows;
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`action:quest:${ownerId}:back:${quest.id}`)
        .setLabel('Return to Work')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return rows;
}

async function buildQuestResponse(profile, questResult, { ownerId, avatarURL }) {
  const quest = questResult.quest;
  const pendingEvent = questResult.pendingEvent ?? null;
  const latest = questResult.latest ?? quest.log.at(-1) ?? null;
  const embed = buildQuestEmbed(profile, quest, latest, pendingEvent, { avatarURL });

  let sceneAttachment = null;
  const sceneSource = pendingEvent ?? latest;
  if (sceneSource?.scene && sceneSource?.sprite) {
    try {
      const variant =
        pendingEvent != null
          ? `${quest.id}_pending_${quest.stage + 1}`
          : `${quest.id}_${sceneSource.index ?? quest.log.length}`;
      sceneAttachment = await composeQuestScene({
        scenePath: sceneSource.scene,
        eventPath: sceneSource.sprite,
        variant
      });
      embed.setImage(`attachment://${sceneAttachment.fileName}`);
    } catch (err) {
      console.error('[action] failed to compose quest scene', err);
    }
  }

  let content = 'You set out on a hunting quest.';
  if (questResult.resumed && !pendingEvent) {
    content = 'You pick up the hunting trail where you left off.';
  } else if (pendingEvent) {
    content = 'A new encounter unfolds. Choose how to proceed.';
  }
  if (quest.status === 'awaiting_finale') {
    content = 'You corner your quarry. Face it to finish the hunt.';
  }
  if (quest.status === 'complete') {
    content = 'The hunt concludes with a decisive victory.';
  }

  const response = {
    content,
    embeds: [embed],
    components: buildQuestComponents(ownerId, quest, {
      eventOptions: questResult.eventOptions ?? [],
      pathOptions: questResult.pathOptions ?? []
    }),
    attachments: []
  };

  if (sceneAttachment) {
    response.files = [sceneAttachment.attachment];
  }

  return response;
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
    const parts = interaction.customId.split(':');
    const commandKey = parts.shift();
    if (commandKey !== 'action') {
      return;
    }

    const scope = parts.shift() ?? '';
    const ownerId = parts.shift() ?? '';
    const detail = parts.shift() ?? null;
    const extra = parts;

    if (!ownerId) {
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: 'Only the player who opened this menu can use it.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let profile = game.getPlayer(ownerId);
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
          ...response,
          attachments: []
        });
        return;
      }

      if (detail === 'root') {
        const response = buildRootMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Select a submenu to begin.',
          ...response,
          attachments: []
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
          ...response,
          attachments: []
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

      if (action.key === 'hunter') {
        try {
          const questResult = await game.startHuntingQuest(ownerId);
          profile = game.getPlayer(ownerId) ?? profile;
          const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
          await interaction.update(response);
        } catch (err) {
          if (err?.message === 'Not enough stamina.') {
            const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
            await interaction.update({
              content: 'You are too exhausted to hunt.',
              ...response,
              attachments: []
            });
            return;
          }
          console.error('[action] failed to start hunting quest', err);
          const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
          await interaction.update({
            content: 'Something went wrong starting that hunt.',
            ...response,
            attachments: []
          });
        }
        return;
      }

      try {
        const updatedProfile = await game.spendStamina(ownerId, 1);
        const response = buildWorkMenu(updatedProfile, game, { ownerId, avatarURL });
        await interaction.update({
          content: `${action.flavor} (-1 stamina)`,
          ...response,
          attachments: []
        });
      } catch (err) {
        if (err?.message === 'Not enough stamina.') {
          const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
          await interaction.update({
            content: 'You are too exhausted to act.',
            ...response,
            attachments: []
          });
          return;
        }

        console.error('[action] failed to resolve work action', err);
        const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'Something went wrong while taking that action.',
          ...response,
          attachments: []
        });
      }
      return;
    }

    if (scope === 'quest') {
      if (detail === 'event') {
        const [questId, optionId] = extra;
        if (!questId || !optionId) {
          await interaction.reply({
            content: 'That encounter has already passed.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        try {
          const questResult = await game.resolveHuntingEventAction({ userId: ownerId, questId, optionId });
          profile = game.getPlayer(ownerId) ?? profile;
          const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
          await interaction.editReply(response);
          return;
        } catch (err) {
          if (err?.message === 'That quest is no longer active.') {
            const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
            await interaction.editReply({
              content: 'That hunt is no longer available.',
              ...response,
              attachments: []
            });
            return;
          }
          if (err?.message === 'That choice is no longer available.') {
            try {
              const questResult = await game.startHuntingQuest(ownerId);
              profile = game.getPlayer(ownerId) ?? profile;
              const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
              response.content = 'That choice slipped away. A new encounter unfolds.';
              await interaction.editReply(response);
            } catch (refreshErr) {
              console.error('[action] failed to refresh hunting encounter', refreshErr);
              await interaction.editReply({
                content: 'That choice slipped away. Select a different option.',
                embeds: [],
                components: [],
                attachments: []
              });
            }
            return;
          }
          console.error('[action] failed to resolve hunting encounter', err);
          await interaction.editReply({
            content: 'Something went wrong resolving that encounter.',
            embeds: [],
            components: [],
            attachments: []
          });
          return;
        }
      }

      if (detail === 'choose') {
        const [questId, optionId] = extra;
        if (!questId || !optionId) {
          await interaction.reply({
            content: 'That path is no longer available.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        try {
          const questResult = await game.chooseHuntingQuestOption({ userId: ownerId, questId, optionId });
          profile = game.getPlayer(ownerId) ?? profile;
          const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
          await interaction.editReply(response);
          return;
        } catch (err) {
          if (err?.message === 'That quest is no longer active.') {
            const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
            await interaction.editReply({
              content: 'That hunt is no longer available.',
              ...response,
              attachments: []
            });
            return;
          }
          if (err?.message === 'That path is no longer available.') {
            try {
              const questResult = await game.startHuntingQuest(ownerId);
              profile = game.getPlayer(ownerId) ?? profile;
              const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
              response.content = 'That path slipped away. Choose a new route.';
              await interaction.editReply(response);
              return;
            } catch (refreshErr) {
              console.error('[action] failed to refresh hunting quest', refreshErr);
            }
          }
          console.error('[action] failed to progress hunting quest', err);
          await interaction.editReply({
            content: 'Something went wrong continuing that hunt.',
            embeds: [],
            components: [],
            attachments: []
          });
          return;
        }
      }

      if (detail === 'finale') {
        const [questId] = extra;
        if (!questId) {
          await interaction.reply({
            content: 'That hunt cannot be completed right now.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.deferUpdate();
        try {
          const questResult = await game.completeHuntingQuestFinale({ userId: ownerId, questId });
          profile = game.getPlayer(ownerId) ?? profile;
          const response = await buildQuestResponse(profile, questResult, { ownerId, avatarURL });
          await interaction.editReply(response);
          return;
        } catch (err) {
          if (err?.message === 'That quest is no longer active.') {
            const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
            await interaction.editReply({
              content: 'That hunt is no longer available.',
              ...response,
              attachments: []
            });
            return;
          }
          console.error('[action] failed to complete hunting finale', err);
          await interaction.editReply({
            content: 'Something went wrong finishing that hunt.',
            embeds: [],
            components: [],
            attachments: []
          });
          return;
        }
      }

      if (detail === 'back') {
        game.abandonHuntingQuest(ownerId);
        profile = game.getPlayer(ownerId) ?? profile;
        const response = buildWorkMenu(profile, game, { ownerId, avatarURL });
        await interaction.update({
          content: 'You return to the work board.',
          ...response,
          attachments: []
        });
        return;
      }
    }
  }
};
