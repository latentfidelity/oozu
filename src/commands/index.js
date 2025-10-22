import { battleCommand } from './battle.js';
import { pingCommand } from './ping.js';
import { profileCommand } from './profile.js';
import { registerCommand } from './register.js';
import { speciesCommand } from './species.js';
import { teamCommand } from './team.js';

export const commands = [
  registerCommand,
  profileCommand,
  teamCommand,
  speciesCommand,
  battleCommand,
  pingCommand
];

export function createCommandMap() {
  const map = new Map();
  for (const command of commands) {
    map.set(command.name, command);
  }
  return map;
}

export function slashPayload() {
  return commands
    .filter((command) => typeof command.slashData?.toJSON === 'function')
    .map((command) => command.slashData.toJSON());
}
