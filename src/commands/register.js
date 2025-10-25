import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} from 'discord.js';

import { buildProfileEmbed } from './util.js';
import { createSpriteAttachment } from '../utils/sprites.js';

const PLAYER_CLASSES = ['Tamer', 'Hunter', 'Alchemist'];
const GENDER_CHOICES = [
  { key: 'male', label: '♂ Male', pronoun: 'he' },
  { key: 'female', label: '♀ Female', pronoun: 'she' },
  { key: 'other', label: '⚧ Other', pronoun: 'they' }
];
const NUMBER_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const CLASS_EMOJIS = new Map([
  ['tamer', '🐾'],
  ['hunter', '🏹'],
  ['alchemist', '⚗️']
]);

const CLASS_KEY_MAP = new Map(PLAYER_CLASSES.map((cls) => [cls.toLowerCase(), cls]));
const GENDER_KEY_MAP = new Map(GENDER_CHOICES.map((choice) => [choice.key, choice.label]));
const PRONOUN_KEY_MAP = new Map(GENDER_CHOICES.map((choice) => [choice.key, choice.pronoun]));

function resolveDisplayName(member, user) {
  return member?.displayName ?? user?.globalName ?? user?.username;
}

function buildGenderPrompt({ displayName, ownerId }) {
  const embed = new EmbedBuilder()
    .setTitle(`Welcome, ${displayName}!`)
    .setDescription('Select the gender that best represents you.')
    .setColor(0x4b7bec);

  const buttons = GENDER_CHOICES.map((choice) =>
    new ButtonBuilder()
      .setCustomId(`register:gender:${ownerId}:${choice.key}`)
      .setLabel(choice.label)
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(buttons)]
  };
}

function buildClassPrompt({ displayName, ownerId, genderKey }) {
  const genderLabel = GENDER_KEY_MAP.get(genderKey) ?? 'Unspecified';
  const embed = new EmbedBuilder()
    .setTitle(`Welcome, ${displayName}!`)
    .setDescription(`Gender: **${genderLabel}**\nChoose your class to begin your Oozu journey.`)
    .setColor(0x4b7bec);

  const buttons = PLAYER_CLASSES.map((playerClass, idx) =>
    new ButtonBuilder()
      .setCustomId(`register:class:${ownerId}:${genderKey}:${playerClass.toLowerCase()}`)
      .setLabel(playerClass)
      .setEmoji(CLASS_EMOJIS.get(playerClass.toLowerCase()) ?? NUMBER_EMOJIS[idx + 1] ?? '🔹')
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
  }

  return {
    embeds: [embed],
    components: rows
  };
}

async function buildStarterPrompt({
  displayName,
  playerClass,
  genderKey,
  templates,
  ownerId
}) {
  const genderLabel = GENDER_KEY_MAP.get(genderKey) ?? 'Unspecified';
  const getLatinDesignation = (template) => {
    const element = template.element?.trim();
    const tier = template.tier?.trim() || 'Oozu';
    if (element) {
      return `${element} ${tier}`;
    }
    return template.name;
  };

  const embed = new EmbedBuilder()
    .setTitle(`Welcome, ${displayName}!`)
    .setDescription(`Gender: **${genderLabel}**\nClass: **${playerClass}**\nChoose your first Oozu.`)
    .setColor(0x4b7bec);

  const buttons = templates.map((template, idx) =>
    new ButtonBuilder()
      .setCustomId(
        `register:starter:${ownerId}:${genderKey}:${playerClass.toLowerCase()}:${template.templateId}`
      )
      .setLabel(getLatinDesignation(template))
      .setEmoji(NUMBER_EMOJIS[idx + 1] ?? '🔢')
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
  }

  const attachments = [];
  const embeds = [embed];
  for (const [idx, template] of templates.entries()) {
    try {
      const { attachment, fileName } = await createSpriteAttachment(template.sprite, {
        targetWidth: 160,
        variant: `starter_${ownerId}_${template.templateId}_${idx}`
      });
      attachments.push(attachment);

      const latinName = getLatinDesignation(template);
      const templateEmbed = new EmbedBuilder()
        .setTitle(`${NUMBER_EMOJIS[idx + 1] ?? '🔹'} ${latinName}`)
        .setDescription(template.description)
        .setColor(0x32a852)
        .setImage(`attachment://${fileName}`);
      embeds.push(templateEmbed);
    } catch (err) {
      console.warn('[register] failed to load sprite', template.templateId, err);
    }
  }

  return {
    embeds,
    components: rows,
    files: attachments
  };
}

export const registerCommand = {
  name: 'register',
  slashData: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Join Oozu World.'),

  async handleInteraction(interaction, { game }) {
    const existing = game.getPlayer(interaction.user.id);
    if (existing) {
      const embed = buildProfileEmbed(existing, game, {
        title: 'You are already registered!',
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const displayName = resolveDisplayName(interaction.member, interaction.user);
    const genderPrompt = buildGenderPrompt({ displayName, ownerId: interaction.user.id });

    await interaction.reply({
      content: 'Select your gender to continue registration.',
      embeds: genderPrompt.embeds,
      components: genderPrompt.components,
      flags: MessageFlags.Ephemeral
    });
  },

  async handleMessage(message, args, { game }) {
    const existing = game.getPlayer(message.author.id);
    if (existing) {
      const embed = buildProfileEmbed(existing, game, {
        title: 'You are already registered!',
        avatarURL: message.author.displayAvatarURL?.() ?? message.author.avatarURL?.()
      });
      await message.reply({ embeds: [embed] });
      return;
    }

    const displayName = resolveDisplayName(message.member, message.author);
    const prompt = buildGenderPrompt({ displayName, ownerId: message.author.id });
    console.log('[register] gender prompt message', message.author.id);

    await message.reply({
      content: `${message.author}, select your gender to continue registration.`,
      embeds: prompt.embeds,
      components: prompt.components
    });
  },

  async handleComponent(interaction, { game }) {
    const params = interaction.customId.split(':');
    const [commandKey, action, ownerId] = params;
    if (commandKey !== 'register') {
      return;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: 'Only the player who initiated registration can choose a starter.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const displayName = resolveDisplayName(interaction.member, interaction.user);

    if (action === 'gender') {
      const genderKey = params[3];
      const gender = GENDER_KEY_MAP.get(genderKey);
      const pronoun = PRONOUN_KEY_MAP.get(genderKey);
      if (!gender) {
        await interaction.reply({
          content: 'Gender data missing for this selection. Please run /register again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (!pronoun) {
        await interaction.reply({
          content: 'Pronoun data missing for this selection. Please run /register again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      console.log('[register] gender selected', ownerId, 'gender', gender);

      const classPrompt = buildClassPrompt({ displayName, ownerId, genderKey });
      await interaction.update({
        content: 'Choose your class to continue registration.',
        embeds: classPrompt.embeds,
        components: classPrompt.components
      });
      return;
    }

    if (action === 'class') {
      const genderKey = params[3];
      const classKey = params[4];
      const playerClass = CLASS_KEY_MAP.get(classKey);
      if (!playerClass) {
        await interaction.reply({
          content: 'Class data missing for this selection. Please run /register again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const gender = GENDER_KEY_MAP.get(genderKey);
      const pronoun = PRONOUN_KEY_MAP.get(genderKey);
      if (!gender) {
        await interaction.reply({
          content: 'Gender data missing for this selection. Please run /register again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (!pronoun) {
        await interaction.reply({
          content: 'Pronoun data missing for this selection. Please run /register again.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      console.log('[register] class selected', ownerId, 'class', playerClass);

      let options;
      try {
        options = game.sampleStarterTemplates(3);
      } catch (err) {
        await interaction.reply({
          content: err.message ?? 'No starter Oozu are available right now. Please try again later.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const starterPrompt = await buildStarterPrompt({
        displayName,
        playerClass,
        genderKey,
        templates: options,
        ownerId
      });

      await interaction.update({
        content: 'Select your first Oozu to complete registration.',
        embeds: starterPrompt.embeds,
        components: starterPrompt.components,
        files: starterPrompt.files
      });
      return;
    }

    if (action !== 'starter') {
      return;
    }

    if (game.getPlayer(ownerId)) {
      await interaction.reply({
        content: 'You are already registered.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const genderKey = params[3];
    const classKey = params[4];
    const templateId = params[5];

    const playerClass = CLASS_KEY_MAP.get(classKey);
    if (!playerClass) {
      await interaction.reply({
        content: 'Class data missing for this selection. Please run /register again.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const gender = GENDER_KEY_MAP.get(genderKey);
    const pronoun = PRONOUN_KEY_MAP.get(genderKey);
    if (!gender) {
      await interaction.reply({
        content: 'Gender data missing for this selection. Please run /register again.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (!pronoun) {
      await interaction.reply({
        content: 'Pronoun data missing for this selection. Please run /register again.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      const profile = await game.registerPlayer({
        userId: ownerId,
        displayName,
        gender,
        pronoun,
        playerClass,
        starterTemplateId: templateId
      });
      console.log('[register] completed', ownerId, 'class', playerClass, 'starter', templateId);

      const embed = buildProfileEmbed(profile, game, {
        title: 'Welcome to Oozu World!',
        avatarURL: interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.()
      });
      await interaction.update({ embeds: [embed], components: [], content: '', files: [] });
    } catch (err) {
      await interaction.reply({
        content: err.message ?? 'Failed to register. Please try again.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
