import { actionCommand } from './action.js';
import { pingCommand } from './ping.js';
import { registerCommand } from './register.js';
import { resetCommand } from './reset.js';
import { teamCommand } from './team.js';

export const commands = [
  actionCommand,
  registerCommand,
  teamCommand,
  resetCommand,
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
