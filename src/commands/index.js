import { battleCommand } from './battle.js';
import { pingCommand } from './ping.js';
import { registerCommand } from './register.js';
import { oozuCommand } from './oozu.js';
import { teamCommand } from './team.js';

export const commands = [
  registerCommand,
  teamCommand,
  oozuCommand,
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
