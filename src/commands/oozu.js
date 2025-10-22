import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { createSpriteAttachment } from '../utils/sprites.js';

export const oozuCommand = {
  name: 'oozu',
  slashData: new SlashCommandBuilder()
    .setName('oozu')
    .setDescription('Inspect an Oozu template.')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Template name or ID (e.g. Water Oozu).')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async handleInteraction(interaction, { game }) {
    const query = interaction.options.getString('query', true);
    const template = game.findTemplate(query);
    if (!template) {
      await interaction.reply({
        content: `No Oozu template found matching \`${query}\`.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply();
    const response = await buildTemplateResponse(template);
    await interaction.editReply(response);
  },

  async handleMessage(message, args, { game }) {
    if (args.length === 0) {
      await message.reply('Usage: !oozu <template name or id>');
      return;
    }

    const query = args.join(' ');
    const template = game.findTemplate(query);
    if (!template) {
      await message.reply(`No Oozu template found matching \`${query}\`.`);
      return;
    }

    const response = await buildTemplateResponse(template);
    await message.reply(response);
  },

  async handleAutocomplete(interaction, { game }) {
    const focused = interaction.options.getFocused(true);
    const search = focused.value.trim().toLowerCase();
    const suggestions = game
      .listTemplates()
      .filter((template) => {
        if (!search) {
          return true;
        }
        const name = template.name.toLowerCase();
        const id = template.templateId.toLowerCase();
        return name.includes(search) || id.includes(search);
      })
      .slice(0, 25)
      .map((template) => ({
        name: template.name,
        value: template.templateId
      }));

    await interaction.respond(suggestions);
  }
};

async function buildTemplateResponse(template) {
  const { attachment: iconAttachment, fileName: iconFile } = await createSpriteAttachment(template.sprite, {
    targetWidth: 64,
    variant: 'template_icon'
  });

  const { attachment, fileName } = await createSpriteAttachment(template.sprite, {
    scale: 1,
    variant: 'template_full'
  });

  const movesText =
    template.moves.length > 0
      ? template.moves.map((move) => `• **${move.name}** (${move.power}) — ${move.description}`).join('\n')
      : 'No moves recorded.';

  const embed = new EmbedBuilder()
    .setAuthor({ name: template.name, iconURL: `attachment://${iconFile}` })
    .setTitle('Stat Sheet')
    .setDescription(template.description)
    .setColor(0x32a852)
    .addFields(
      { name: 'Element', value: template.element, inline: true },
      { name: 'Tier', value: template.tier, inline: true },
      {
        name: 'Base Stats',
        value: `HP ${template.baseHp}\nATK ${template.baseAttack}\nDEF ${template.baseDefense}`,
        inline: true
      },
      { name: 'Moves', value: movesText, inline: false }
    )
    .setImage(`attachment://${fileName}`)
    .setFooter({ text: 'Oozu prototype build 0.1.0' });

  return { embeds: [embed], files: [iconAttachment, attachment] };
}
