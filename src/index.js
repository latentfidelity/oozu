import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes
} from 'discord.js';

import { createCommandMap, slashPayload } from './commands/index.js';
import { loadSettings } from './config.js';
import { GameService } from './game/gameService.js';
import { JsonStore } from './store/jsonStore.js';

async function main() {
  const settings = loadSettings();
  const store = new JsonStore(settings.saveFile);
  const game = new GameService({
    store,
    templateFile: settings.templateFile
  });
  await game.initialize();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  const commandMap = createCommandMap();
  const context = { client, game, settings };
  client.game = game;

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    try {
      await registerSlashCommands(readyClient, settings);
    } catch (err) {
      console.error('Failed to sync slash commands', err);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      const [commandKey] = interaction.customId.split(':');
      const command = commandMap.get(commandKey);
      if (!command?.handleComponent) {
        return;
      }

      try {
        await command.handleComponent(interaction, context);
      } catch (err) {
        console.error(`Error handling component for ${commandKey}`, err);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: 'Something went wrong handling that action.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content: 'Something went wrong handling that action.',
            flags: MessageFlags.Ephemeral
          });
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const [commandKey] = interaction.customId.split(':');
      const command = commandMap.get(commandKey);
      if (!command?.handleModal) {
        return;
      }

      try {
        await command.handleModal(interaction, context);
      } catch (err) {
        console.error(`Error handling modal for ${commandKey}`, err);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: 'Something went wrong handling that action.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content: 'Something went wrong handling that action.',
            flags: MessageFlags.Ephemeral
          });
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (!command?.handleAutocomplete) {
        return;
      }
      try {
        await command.handleAutocomplete(interaction, context);
      } catch (err) {
        console.error(`Error handling autocomplete for /${interaction.commandName}`, err);
        try {
          await interaction.respond([]);
        } catch {
          /* ignore follow-up errors */
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }
    const command = commandMap.get(interaction.commandName);
    if (!command?.handleInteraction) {
      return;
    }

    try {
      await command.handleInteraction(interaction, context);
    } catch (err) {
      console.error(`Error handling /${interaction.commandName}`, err);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'Something went wrong running that command.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        console.error('[index] interaction not acknowledged in time', interaction.id);
        await interaction.reply({
          content: 'Something went wrong running that command.',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) {
      return;
    }
    if (!message.content.startsWith(settings.commandPrefix)) {
      return;
    }

    const withoutPrefix = message.content.slice(settings.commandPrefix.length).trim();
    if (!withoutPrefix) {
      return;
    }

    const parts = withoutPrefix.split(/\s+/);
    const commandName = parts.shift()?.toLowerCase();
    if (!commandName) {
      return;
    }

    const command = commandMap.get(commandName);
    if (!command?.handleMessage) {
      return;
    }

    try {
      await command.handleMessage(message, parts, context);
    } catch (err) {
      console.error(`Error handling !${commandName}`, err);
      await message.reply('Something went wrong running that command.');
    }
  });

  await client.login(settings.token);
}

async function registerSlashCommands(client, settings) {
  const body = slashPayload();
  if (body.length === 0) {
    return;
  }

  const rest = new REST({ version: '10' }).setToken(settings.token);
  if (settings.guildId) {
    await rest.put(Routes.applicationGuildCommands(client.application.id, settings.guildId), {
      body
    });
    console.log(`Synced commands to guild ${settings.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(client.application.id), { body });
    console.log('Synced commands globally');
  }
}

main().catch((err) => {
  console.error('Fatal error starting Oozu bot', err);
  process.exitCode = 1;
});
