import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder
} from 'discord.js';
import { randomUUID } from 'crypto';

import { createSpriteAttachment } from '../utils/sprites.js';

const sessions = new Map();

function ensureSession(ownerId) {
  let session = sessions.get(ownerId);
  if (!session) {
    session = {
      view: 'root',
      selectedItemId: null,
      selectedOozuIndex: null,
      tradeTargetId: null,
      tradeQuantity: null,
      discardQuantity: null,
      backAction: null
    };
    sessions.set(ownerId, session);
  }
  return session;
}

function changeView(session, view) {
  session.view = view;
  session.selectedItemId = null;
  session.selectedOozuIndex = null;
  session.tradeTargetId = null;
  session.tradeQuantity = null;
  session.discardQuantity = null;
}

function renderItemName(game, itemId) {
  if (!itemId) {
    return 'None';
  }
  return game.getItem(itemId)?.name ?? itemId;
}

function renderHeldItem(game, creature) {
  if (!creature?.heldItem) {
    return 'None';
  }
  return renderItemName(game, creature.heldItem);
}

async function buildItemsSummary(profile, game, { avatarURL } = {}) {
  const summary = new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setAuthor({
      name: `${profile.displayName}'s Inventory`,
      iconURL: avatarURL ?? undefined
    })
    .addFields({ name: 'Oozorbs', value: String(profile.currency), inline: true });

  const attachments = [];
  const heldEmbeds = [];
  const entries = profile.inventoryEntries();
  if (entries.length === 0) {
    summary.addFields({ name: 'Items', value: 'Your bag is empty.', inline: false });
  } else {
    const lines = entries
      .slice()
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map((entry) => {
        const item = game.getItem(entry.itemId);
        const label = item?.name ?? entry.itemId;
        return `• **${label}** ×${entry.quantity}`;
      });
    summary.addFields({ name: 'Items', value: lines.join('\n'), inline: false });
  }

  if (profile.oozu.length > 0) {
    const sessionId = randomUUID();
    for (const [idx, creature] of profile.oozu.entries()) {
      const template = game.getTemplate(creature.templateId);
      let iconURL;
      if (template?.sprite) {
        try {
          const { attachment, fileName } = await createSpriteAttachment(template.sprite, {
            targetWidth: 48,
            variant: `inventory_${sessionId}_${idx}`
          });
          attachments.push(attachment);
          iconURL = `attachment://${fileName}`;
        } catch (err) {
          iconURL = undefined;
        }
      }
      const heldName = renderHeldItem(game, creature);
      const heldEmbed = new EmbedBuilder()
        .setColor(0x6c5ce7)
        .setAuthor({
          name: creature.nickname,
          iconURL: iconURL ?? undefined
        })
        .setDescription(`Held Item: ${heldName}`);
      heldEmbeds.push(heldEmbed);
    }
  }

  return { summary, heldEmbeds, attachments };
}

function resolveContent(notice) {
  return notice ?? undefined;
}

function truncate(text, limit = 90) {
  if (!text) {
    return '';
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function describeItemEffect(item) {
  const effect = item?.effect;
  if (!effect) {
    return null;
  }

  switch (effect.type) {
    case 'restore_hp':
      return 'Fully restores an Oozu\'s HP.';
    case 'restore_mp':
      return 'Fully restores an Oozu\'s MP.';
    case 'restore_stamina': {
      const amount = Number.isFinite(effect.amount) ? Math.max(1, Math.floor(effect.amount)) : 1;
      return amount === 1 ? 'Restores 1 stamina to the player.' : `Restores ${amount} stamina to the player.`;
    }
    default:
      return null;
  }
}

function requiresOozuTarget(item) {
  if (!item?.effect) {
    return false;
  }
  const target = typeof item.effect.target === 'string' ? item.effect.target : null;
  return (target ?? 'oozu') !== 'player';
}

function buildEmptyOption(label) {
  return new StringSelectMenuOptionBuilder().setLabel(label).setValue('none').setDescription('Not available').setDefault(false);
}

async function buildRootMenu(profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });
  const inventoryEntries = profile.inventoryEntries();
  const hasItems = inventoryEntries.length > 0;
  const hasOozu = profile.oozu.length > 0;
  const hasHeld = profile.oozu.some((creature) => creature.heldItem);
  const hasConsumables = inventoryEntries.some((entry) => {
    const item = game.getItem(entry.itemId);
    return item && typeof item.isConsumable === 'function' && item.isConsumable() && entry.quantity > 0;
  });

  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:use`)
      .setLabel('Use Item')
      .setEmoji('🧪')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasConsumables),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:give`)
      .setLabel('Give Item')
      .setEmoji('🫴')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasItems || !hasOozu),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:take`)
      .setLabel('Take Item')
      .setEmoji('🫳')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasHeld),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:trade`)
      .setLabel('Trade')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasItems),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:discard`)
      .setLabel('Discard')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasItems)
  );

  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:menu:${ownerId}:refresh`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [primaryRow, refreshRow];
  if (backAction) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(backAction)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }
  return {
    content: resolveContent(notice),
    embeds: [summary, ...heldEmbeds],
    components: rows,
    files: attachments,
    attachments: []
  };
}

async function buildGiveMenu(session, profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });

  if (session.selectedItemId) {
    summary.addFields({
      name: 'Selected Item',
      value: renderItemName(game, session.selectedItemId),
      inline: true
    });
  }
  if (Number.isInteger(session.selectedOozuIndex) && session.selectedOozuIndex >= 0) {
    const creature = profile.oozu[session.selectedOozuIndex];
    if (creature) {
      summary.addFields({
        name: 'Target Oozu',
        value: `${creature.nickname} — holding ${renderHeldItem(game, creature)}`,
        inline: true
      });
    }
  }

  const inventoryEntries = profile.inventoryEntries();
  const itemOptions =
    inventoryEntries.length > 0
      ? inventoryEntries.map((entry) => {
          const item = game.getItem(entry.itemId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(item?.name ?? entry.itemId)
            .setDescription(truncate(item?.description ?? `Quantity: ${entry.quantity}`))
            .setValue(entry.itemId)
            .setDefault(session.selectedItemId === entry.itemId);
        })
      : [buildEmptyOption('No items available')];

  const oozuOptions =
    profile.oozu.length > 0
      ? profile.oozu.map((creature, idx) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(creature.nickname)
            .setDescription(truncate(`Holding ${renderHeldItem(game, creature)}`))
            .setValue(String(idx))
            .setDefault(session.selectedOozuIndex === idx)
        )
      : [buildEmptyOption('No Oozu available')];

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:give:item`)
    .setPlaceholder('Choose an item to give')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(inventoryEntries.length === 0)
    .addOptions(itemOptions);

  const oozuSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:give:oozu`)
    .setPlaceholder('Choose an Oozu to receive the item')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(profile.oozu.length === 0)
    .addOptions(oozuOptions);

  const confirmDisabled =
    !session.selectedItemId || !Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0;

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:action:${ownerId}:give`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:root`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: resolveContent(notice),
    embeds: [summary.setDescription('Select an item and an Oozu, then confirm to give the item.'), ...heldEmbeds],
    components: [new ActionRowBuilder().addComponents(itemSelect), new ActionRowBuilder().addComponents(oozuSelect), actionsRow],
    files: attachments,
    attachments: []
  };
}

async function buildTakeMenu(session, profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });
  if (Number.isInteger(session.selectedOozuIndex) && session.selectedOozuIndex >= 0) {
    const creature = profile.oozu[session.selectedOozuIndex];
    if (creature) {
      summary.addFields({
        name: 'Selected Oozu',
        value: `${creature.nickname} — holding ${renderHeldItem(game, creature)}`,
        inline: true
      });
    }
  }

  const holders = profile.oozu
    .map((creature, idx) => (creature.heldItem ? { creature, idx } : null))
    .filter(Boolean);

  const options =
    holders.length > 0
      ? holders.map(({ creature, idx }) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(creature.nickname)
            .setDescription(truncate(`Holding ${renderHeldItem(game, creature)}`))
            .setValue(String(idx))
            .setDefault(session.selectedOozuIndex === idx)
        )
      : [buildEmptyOption('No held items found')];

  const oozuSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:take:oozu`)
    .setPlaceholder('Choose an Oozu to take their held item')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(holders.length === 0)
    .addOptions(options);

  const confirmDisabled = !Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0;

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:action:${ownerId}:take`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:root`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const base = holders.length === 0 ? 'None of your Oozu are holding items.' : 'Select an Oozu, then confirm to reclaim their item.';
  return {
    content: resolveContent(notice),
    embeds: [summary.setDescription(base), ...heldEmbeds],
    components: [new ActionRowBuilder().addComponents(oozuSelect), actionsRow],
    files: attachments,
    attachments: []
  };
}

async function buildTradeMenu(session, profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });

  if (session.tradeTargetId) {
    summary.addFields({
      name: 'Recipient',
      value: `<@${session.tradeTargetId}>`,
      inline: true
    });
  }
  if (session.selectedItemId) {
    summary.addFields({
      name: 'Selected Item',
      value: renderItemName(game, session.selectedItemId),
      inline: true
    });
  }
  if (Number.isInteger(session.tradeQuantity) && session.tradeQuantity > 0) {
    summary.addFields({
      name: 'Quantity',
      value: String(session.tradeQuantity),
      inline: true
    });
  }

  const inventoryEntries = profile.inventoryEntries();
  const itemOptions =
    inventoryEntries.length > 0
      ? inventoryEntries.map((entry) => {
          const item = game.getItem(entry.itemId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(item?.name ?? entry.itemId)
            .setDescription(truncate(`You own ${entry.quantity}`))
            .setValue(entry.itemId)
            .setDefault(session.selectedItemId === entry.itemId);
        })
      : [buildEmptyOption('No items available')];

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:trade:item`)
    .setPlaceholder('Choose an item to trade')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(inventoryEntries.length === 0)
    .addOptions(itemOptions);

  const availableQuantity = session.selectedItemId ? profile.getItemQuantity(session.selectedItemId) : 0;
  let quantityOptions;
  if (availableQuantity > 0) {
    const upper = Math.min(availableQuantity, 10);
    quantityOptions = [];
    for (let i = 1; i <= upper; i += 1) {
      quantityOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`Quantity: ${i}`)
          .setValue(String(i))
          .setDefault(session.tradeQuantity === i)
      );
    }
  } else {
    quantityOptions = [buildEmptyOption('Select an item first')];
  }

  const quantitySelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:trade:quantity`)
    .setPlaceholder('Select how many to trade')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(availableQuantity <= 0)
    .addOptions(quantityOptions);

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:trade:player`)
    .setPlaceholder('Choose a recipient')
    .setMinValues(1)
    .setMaxValues(1);
  if (session.tradeTargetId) {
    userSelect.setDefaultUsers(session.tradeTargetId);
  }

  const confirmDisabled =
    !session.selectedItemId ||
    !session.tradeTargetId ||
    session.tradeTargetId === ownerId ||
    !Number.isInteger(session.tradeQuantity) ||
    session.tradeQuantity <= 0;

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:action:${ownerId}:trade`)
      .setLabel('Confirm Trade')
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:root`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: resolveContent(notice),
    embeds: [summary.setDescription('Select a recipient, item, and quantity to trade.'), ...heldEmbeds],
    components: [
      new ActionRowBuilder().addComponents(userSelect),
      new ActionRowBuilder().addComponents(itemSelect),
      new ActionRowBuilder().addComponents(quantitySelect),
      actionsRow
    ],
    files: attachments,
    attachments: []
  };
}

async function buildDiscardMenu(session, profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });

  if (session.selectedItemId) {
    summary.addFields({
      name: 'Selected Item',
      value: renderItemName(game, session.selectedItemId),
      inline: true
    });
  }
  if (Number.isInteger(session.discardQuantity) && session.discardQuantity > 0) {
    summary.addFields({
      name: 'Quantity',
      value: String(session.discardQuantity),
      inline: true
    });
  }

  const inventoryEntries = profile.inventoryEntries();
  const itemOptions =
    inventoryEntries.length > 0
      ? inventoryEntries.map((entry) => {
          const item = game.getItem(entry.itemId);
          return new StringSelectMenuOptionBuilder()
            .setLabel(item?.name ?? entry.itemId)
            .setDescription(truncate(`You own ${entry.quantity}`))
            .setValue(entry.itemId)
            .setDefault(session.selectedItemId === entry.itemId);
        })
      : [buildEmptyOption('No items available')];

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:discard:item`)
    .setPlaceholder('Choose an item to discard')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(inventoryEntries.length === 0)
    .addOptions(itemOptions);

  const availableQuantity = session.selectedItemId ? profile.getItemQuantity(session.selectedItemId) : 0;
  let quantityOptions;
  if (availableQuantity > 0) {
    const upper = Math.min(availableQuantity, 10);
    quantityOptions = [];
    for (let i = 1; i <= upper; i += 1) {
      quantityOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`Discard ${i}`)
          .setValue(String(i))
          .setDefault(session.discardQuantity === i)
      );
    }
  } else {
    quantityOptions = [buildEmptyOption('Select an item first')];
  }

  const quantitySelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:discard:quantity`)
    .setPlaceholder('How many to discard?')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(availableQuantity <= 0)
    .addOptions(quantityOptions);

  const confirmDisabled =
    !session.selectedItemId || !Number.isInteger(session.discardQuantity) || session.discardQuantity <= 0;

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:action:${ownerId}:discard`)
      .setLabel('Discard')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:root`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  summary.setDescription('Select an item and quantity to discard.');

  return {
    content: resolveContent(notice),
    embeds: [summary, ...heldEmbeds],
    components: [new ActionRowBuilder().addComponents(itemSelect), new ActionRowBuilder().addComponents(quantitySelect), actionsRow],
    files: attachments,
    attachments: []
  };
}

async function buildUseMenu(session, profile, game, { ownerId, avatarURL, notice, backAction } = {}) {
  const { summary, heldEmbeds, attachments } = await buildItemsSummary(profile, game, { avatarURL });
  summary.setDescription('Select a consumable to use. Items are consumed immediately after confirmation.');

  const inventoryEntries = profile.inventoryEntries();
  const consumables = inventoryEntries
    .map((entry) => {
      const item = game.getItem(entry.itemId);
      if (!item || typeof item.isConsumable !== 'function' || !item.isConsumable()) {
        return null;
      }
      return { item, quantity: entry.quantity };
    })
    .filter(Boolean);

  let selectedItem = session.selectedItemId ? game.getItem(session.selectedItemId) : null;
  if (!selectedItem || typeof selectedItem.isConsumable !== 'function' || !selectedItem.isConsumable()) {
    selectedItem = null;
  }

  const itemOptions =
    consumables.length > 0
      ? consumables.map(({ item, quantity }) => {
          const effectText = describeItemEffect(item);
          const description = effectText ? `${effectText} (You own ${quantity})` : `You own ${quantity}`;
          return new StringSelectMenuOptionBuilder()
            .setLabel(item?.name ?? item.itemId)
            .setDescription(truncate(description))
            .setValue(item.itemId)
            .setDefault(selectedItem?.itemId === item.itemId);
        })
      : [buildEmptyOption('No usable items available')];

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:use:item`)
    .setPlaceholder('Choose an item to use')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(consumables.length === 0)
    .addOptions(itemOptions);

  const requiresTarget = selectedItem ? requiresOozuTarget(selectedItem) : false;
  const anyRequiresTarget = consumables.some(({ item }) => requiresOozuTarget(item));

  const oozuOptions =
    profile.oozu.length > 0
      ? profile.oozu.map((creature, idx) => {
          const template = game.getTemplate(creature.templateId);
          let description = 'No template data available.';
          if (template) {
            const maxHp = Math.max(0, Math.floor(game.calculateHp(template, creature.level)));
            const maxMp = Math.max(0, Math.floor(game.calculateMp(template, creature.level)));
            const currentHp = Math.max(
              0,
              Math.min(Number.isFinite(creature.currentHp) ? Math.floor(creature.currentHp) : maxHp, maxHp)
            );
            const currentMp = Math.max(
              0,
              Math.min(Number.isFinite(creature.currentMp) ? Math.floor(creature.currentMp) : maxMp, maxMp)
            );
            description = `HP ${currentHp}/${maxHp} • MP ${currentMp}/${maxMp}`;
          }
          return new StringSelectMenuOptionBuilder()
            .setLabel(creature.nickname)
            .setDescription(truncate(description))
            .setValue(String(idx))
            .setDefault(session.selectedOozuIndex === idx);
        })
      : [buildEmptyOption('No Oozu available')];

  const canSelectOozu = requiresTarget && profile.oozu.length > 0;

  const oozuSelect = new StringSelectMenuBuilder()
    .setCustomId(`items:select:${ownerId}:use:oozu`)
    .setPlaceholder('Choose an Oozu')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(!canSelectOozu)
    .addOptions(oozuOptions);

  const confirmDisabled =
    !selectedItem || (requiresTarget && (!Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0));

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`items:action:${ownerId}:use`)
      .setLabel('Use Item')
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`items:view:${ownerId}:root`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const files = [...attachments];
  const embeds = [summary, ...heldEmbeds];
  if (selectedItem) {
    const preview = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle(selectedItem.name)
      .setDescription(selectedItem.description ?? 'No description provided.');
    const effectText = describeItemEffect(selectedItem);
    if (effectText) {
      preview.addFields({ name: 'Effect', value: effectText, inline: false });
    }
    const quantityOwned = profile.getItemQuantity(selectedItem.itemId);
    preview.addFields({ name: 'Quantity', value: `You own ${quantityOwned}`, inline: true });

    if (requiresTarget && Number.isInteger(session.selectedOozuIndex) && session.selectedOozuIndex >= 0) {
      const creature = profile.oozu[session.selectedOozuIndex];
      if (creature) {
        preview.addFields({ name: 'Target', value: creature.nickname, inline: true });
      }
    }

    if (selectedItem.sprite) {
      const sessionId = randomUUID();
      try {
        const { attachment, fileName } = await createSpriteAttachment(selectedItem.sprite, {
          targetWidth: 96,
          variant: `item_${sessionId}`
        });
        files.push(attachment);
        preview.setThumbnail(`attachment://${fileName}`);
      } catch (err) {
        /* ignore sprite loading errors */
      }
    }

    embeds.push(preview);
  }

  const components = [new ActionRowBuilder().addComponents(itemSelect)];
  if (anyRequiresTarget) {
    components.push(new ActionRowBuilder().addComponents(oozuSelect));
  }
  components.push(actionsRow);

  return {
    content: resolveContent(notice),
    embeds,
    components,
    files,
    attachments: []
  };
}

async function buildViewForSession(session, profile, game, context = {}) {
  if (session.view === 'give') {
    return buildGiveMenu(session, profile, game, context);
  }
  if (session.view === 'take') {
    return buildTakeMenu(session, profile, game, context);
  }
  if (session.view === 'trade') {
    return buildTradeMenu(session, profile, game, context);
  }
  if (session.view === 'discard') {
    return buildDiscardMenu(session, profile, game, context);
  }
  if (session.view === 'use') {
    return buildUseMenu(session, profile, game, context);
  }
  return buildRootMenu(profile, game, context);
}

export const itemsCommand = {
  name: 'items',
  slashData: new SlashCommandBuilder().setName('items').setDescription('Open the interactive items menu.'),

  async handleInteraction(interaction, { game }) {
    const profile = game.getPlayer(interaction.user.id);
    if (!profile) {
      await interaction.reply({
        content: 'Register first with `/register` to start collecting items.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const session = ensureSession(interaction.user.id);
    changeView(session, 'root');
    session.backAction = null;

    const avatarURL = interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.();
    const response = await buildRootMenu(profile, game, {
      ownerId: interaction.user.id,
      avatarURL,
      backAction: session.backAction
    });

    await interaction.reply({
      ...response,
      flags: MessageFlags.Ephemeral
    });
  },

  async handleMessage(message, _args, { game }) {
    const profile = game.getPlayer(message.author.id);
    if (!profile) {
      await message.reply('Register first with `/register` to start collecting items.');
      return;
    }

    const session = ensureSession(message.author.id);
    changeView(session, 'root');
    session.backAction = null;
    const avatarURL = message.author.displayAvatarURL?.() ?? message.author.avatarURL?.();
    const response = await buildRootMenu(profile, game, {
      ownerId: message.author.id,
      avatarURL,
      backAction: session.backAction
    });
    await message.reply({
      ...response,
      allowedMentions: { users: [] }
    });
  },

  async handleComponent(interaction, { game }) {
    const [commandKey, scope, ownerId, action, detail] = interaction.customId.split(':');
    if (commandKey !== 'items') {
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
        content: 'Register first with `/register` to manage items.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const session = ensureSession(ownerId);
    const avatarURL = interaction.user.displayAvatarURL?.() ?? interaction.user.avatarURL?.();

    if (scope === 'menu') {
      changeView(session, 'root');
      if (action === 'open') {
        session.backAction = `team:player:${ownerId}`;
      }
      const response = await buildRootMenu(profile, game, {
        ownerId,
        avatarURL,
        notice: action === 'refresh' ? 'Inventory refreshed.' : null,
        backAction: session.backAction
      });
      await interaction.update(response);
      return;
    }

    if (scope === 'view') {
      changeView(session, action);
      const response = await buildViewForSession(session, profile, game, {
        ownerId,
        avatarURL,
        backAction: session.backAction
      });
      await interaction.update(response);
      return;
    }

    if (scope === 'select') {
      if (action === 'give') {
        if (detail === 'item') {
          session.selectedItemId = interaction.values[0];
        } else if (detail === 'oozu') {
          session.selectedOozuIndex = Number.parseInt(interaction.values[0], 10);
        }
      } else if (action === 'take') {
        session.selectedOozuIndex = Number.parseInt(interaction.values[0], 10);
      } else if (action === 'trade') {
        if (detail === 'item') {
          session.selectedItemId = interaction.values[0];
          const available = profile.getItemQuantity(session.selectedItemId);
          session.tradeQuantity = available > 0 ? Math.min(session.tradeQuantity ?? 1, available) : null;
        } else if (detail === 'quantity') {
          session.tradeQuantity = Number.parseInt(interaction.values[0], 10);
        } else if (detail === 'player') {
          session.tradeTargetId = interaction.values[0];
        }
      } else if (action === 'discard') {
        if (detail === 'item') {
          session.selectedItemId = interaction.values[0];
          const available = profile.getItemQuantity(session.selectedItemId);
          session.discardQuantity = available > 0 ? Math.min(session.discardQuantity ?? 1, available) : null;
        } else if (detail === 'quantity') {
          session.discardQuantity = Number.parseInt(interaction.values[0], 10);
        }
      } else if (action === 'use') {
        if (detail === 'item') {
          session.selectedItemId = interaction.values[0];
          const selected = game.getItem(session.selectedItemId);
          if (!requiresOozuTarget(selected)) {
            session.selectedOozuIndex = null;
          }
        } else if (detail === 'oozu') {
          session.selectedOozuIndex = Number.parseInt(interaction.values[0], 10);
        }
      }

      const response = await buildViewForSession(session, profile, game, {
        ownerId,
        avatarURL,
        backAction: session.backAction
      });
      await interaction.update(response);
      return;
    }

    if (scope === 'action') {
      try {
        if (action === 'use') {
          if (!session.selectedItemId) {
            throw new Error('Choose an item to use.');
          }
          const selectedItem = game.getItem(session.selectedItemId);
          if (!selectedItem || typeof selectedItem.isConsumable !== 'function' || !selectedItem.isConsumable()) {
            throw new Error('That item cannot be used.');
          }
          const needsTarget = requiresOozuTarget(selectedItem);
          if (needsTarget && (!Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0)) {
            throw new Error('Choose an Oozu for that item.');
          }

          const result = await game.useItem({
            userId: ownerId,
            itemId: selectedItem.itemId,
            oozuIndex: needsTarget ? session.selectedOozuIndex : null
          });

          const updatedProfile = game.getPlayer(ownerId);
          let notice;
          if (result.type === 'restore_hp' && result.creature) {
            const currentHp = Number.isFinite(result.creature.currentHp) ? result.creature.currentHp : result.max;
            notice = `Used **${selectedItem.name}** on ${result.creature.nickname}. HP is now ${currentHp}/${result.max}.`;
          } else if (result.type === 'restore_mp' && result.creature) {
            const currentMp = Number.isFinite(result.creature.currentMp) ? result.creature.currentMp : result.max;
            notice = `Used **${selectedItem.name}** on ${result.creature.nickname}. MP is now ${currentMp}/${result.max}.`;
          } else if (result.type === 'restore_stamina') {
            notice = `Drank **${selectedItem.name}** and restored ${result.restored} stamina (${result.profile.stamina}/${result.max}).`;
          } else {
            notice = `Used **${selectedItem.name}**.`;
          }

          changeView(session, 'root');
          const response = await buildRootMenu(updatedProfile ?? profile, game, {
            ownerId,
            avatarURL,
            notice,
            backAction: session.backAction
          });
          await interaction.update(response);
          return;
        }

        if (action === 'give') {
          if (!session.selectedItemId || !Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0) {
            throw new Error('Select an item and an Oozu before confirming.');
          }
          const result = await game.giveItemToOozu({
            userId: ownerId,
            oozuIndex: session.selectedOozuIndex,
            itemId: session.selectedItemId
          });
          const heldName = renderItemName(game, result.item.itemId);
          const parts = [`${result.creature.nickname} now holds **${heldName}**.`];
          if (result.previousItem && result.previousItem !== result.item.itemId) {
            parts.push(`${renderItemName(game, result.previousItem)} was returned to your bag.`);
          }
          changeView(session, 'root');
          const updatedProfile = game.getPlayer(ownerId);
          const response = await buildRootMenu(updatedProfile ?? profile, game, {
            ownerId,
            avatarURL,
            notice: parts.join(' '),
            backAction: session.backAction
          });
          await interaction.update(response);
          return;
        }

        if (action === 'take') {
          if (!Number.isInteger(session.selectedOozuIndex) || session.selectedOozuIndex < 0) {
            throw new Error('Select an Oozu before confirming.');
          }
          const result = await game.unequipItemFromOozu({
            userId: ownerId,
            oozuIndex: session.selectedOozuIndex
          });
          const itemName = renderItemName(game, result.itemId);
          changeView(session, 'root');
          const updatedProfile = game.getPlayer(ownerId);
          const response = await buildRootMenu(updatedProfile ?? profile, game, {
            ownerId,
            avatarURL,
            notice: `${result.creature.nickname} returned **${itemName}**.`,
            backAction: session.backAction
          });
          await interaction.update(response);
          return;
        }

        if (action === 'trade') {
          if (!session.tradeTargetId || session.tradeTargetId === ownerId) {
            throw new Error('Choose a recipient to trade with.');
          }
          if (!session.selectedItemId) {
            throw new Error('Choose an item to trade.');
          }
          if (!Number.isInteger(session.tradeQuantity) || session.tradeQuantity <= 0) {
            throw new Error('Select a valid quantity.');
          }
          const result = await game.tradeItem({
            fromUserId: ownerId,
            toUserId: session.tradeTargetId,
            itemId: session.selectedItemId,
            quantity: session.tradeQuantity
          });
          const recipientName = result.recipient.displayName ?? `<@${session.tradeTargetId}>`;
          const itemName = renderItemName(game, result.item.itemId);
          changeView(session, 'root');
          const updatedProfile = game.getPlayer(ownerId);
          const response = await buildRootMenu(updatedProfile ?? profile, game, {
            ownerId,
            avatarURL,
            notice: `Traded **${session.tradeQuantity}× ${itemName}** to ${recipientName}.`,
            backAction: session.backAction
          });
          await interaction.update(response);
          return;
        }

        if (action === 'discard') {
          if (!session.selectedItemId) {
            throw new Error('Choose an item to discard.');
          }
          if (!Number.isInteger(session.discardQuantity) || session.discardQuantity <= 0) {
            throw new Error('Select a quantity to discard.');
          }
          const quantity = session.discardQuantity;
          const result = await game.removeItemFromInventory(ownerId, session.selectedItemId, quantity);
          changeView(session, 'root');
          const updatedProfile = game.getPlayer(ownerId);
          const itemName = renderItemName(game, result.item.itemId);
          const response = await buildRootMenu(updatedProfile ?? profile, game, {
            ownerId,
            avatarURL,
            notice: `Discarded **${quantity}× ${itemName}**.`,
            backAction: session.backAction
          });
          await interaction.update(response);
          return;
        }
      } catch (err) {
        const response = await buildViewForSession(session, profile, game, {
          ownerId,
          avatarURL,
          backAction: session.backAction,
          notice: err?.message ?? 'Something went wrong while completing that action.'
        });
        await interaction.update(response);
      }
    }
  }
};
