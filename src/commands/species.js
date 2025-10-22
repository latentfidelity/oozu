import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { createSpriteAttachment } from '../utils/sprites.js';

export const speciesCommand = {
  name: 'species',
  slashData: new SlashCommandBuilder()
    .setName('species')
    .setDescription('View the stat sheet for an Oozu species.')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Species name or ID (e.g. Water Oozu).')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async handleInteraction(interaction, { game }) {
    const query = interaction.options.getString('query', true);
    const species = game.findSpecies(query);
    if (!species) {
      await interaction.reply({
        content: `No species found matching \`${query}\`.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply();
    const response = await buildSpeciesResponse(species);
    await interaction.editReply(response);
  },

  async handleMessage(message, args, { game }) {
    if (args.length === 0) {
      await message.reply('Usage: !species <species name or id>');
      return;
    }

    const query = args.join(' ');
    const species = game.findSpecies(query);
    if (!species) {
      await message.reply(`No species found matching \`${query}\`.`);
      return;
    }

    const response = await buildSpeciesResponse(species);
    await message.reply(response);
  },

  async handleAutocomplete(interaction, { game }) {
    const focused = interaction.options.getFocused(true);
    const search = focused.value.trim().toLowerCase();
    const suggestions = game
      .listSpecies()
      .filter((species) => {
        if (!search) {
          return true;
        }
        const name = species.name.toLowerCase();
        const id = species.speciesId.toLowerCase();
        return name.includes(search) || id.includes(search);
      })
      .slice(0, 25)
      .map((species) => ({
        name: species.name,
        value: species.speciesId
      }));

    await interaction.respond(suggestions);
  }
};

async function buildSpeciesResponse(species) {
  const { attachment: iconAttachment, fileName: iconFile } = await createSpriteAttachment(species.sprite, {
    targetWidth: 64,
    variant: 'species_icon'
  });

  const { attachment, fileName } = await createSpriteAttachment(species.sprite, {
    scale: 1,
    variant: 'species_full'
  });

  const movesText =
    species.moves.length > 0
      ? species.moves.map((move) => `• **${move.name}** (${move.power}) — ${move.description}`).join('\n')
      : 'No moves recorded.';

  const embed = new EmbedBuilder()
    .setAuthor({ name: species.name, iconURL: `attachment://${iconFile}` })
    .setTitle('Stat Sheet')
    .setDescription(species.description)
    .setColor(0x32a852)
    .addFields(
      { name: 'Element', value: species.element, inline: true },
      { name: 'Tier', value: species.tier, inline: true },
      {
        name: 'Base Stats',
        value: `HP ${species.baseHp}\nATK ${species.baseAttack}\nDEF ${species.baseDefense}`,
        inline: true
      },
      { name: 'Moves', value: movesText, inline: false }
    )
    .setImage(`attachment://${fileName}`)
    .setFooter({ text: 'Oozu prototype build 0.1.0' });

  return { embeds: [embed], files: [iconAttachment, attachment] };
}
