import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

loadEnv();

export function loadSettings() {
  const token = process.env.OOZU_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'Missing Discord token. Set Oozu bot token via Oozu config or Oozu env.'
    );
  }

  const commandPrefix = process.env.OOZU_COMMAND_PREFIX ?? '!';
  const guildId = process.env.OOZU_GUILD_ID || null;
  const dataDir = resolve(process.cwd(), process.env.OOZU_DATA_DIR ?? 'data');

  mkdirSync(dataDir, { recursive: true });

  return {
    token,
    commandPrefix,
    guildId,
    dataDir,
    speciesFile: resolve(dataDir, 'oozu_species.json'),
    saveFile: resolve(dataDir, 'player_state.json')
  };
}
