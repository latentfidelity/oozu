# Oozu Arena Prototype

Oozu is a Discord game bot now powered by **Node.js** and `discord.js`. It delivers the same creature collecting and battling experience as the original Python prototype while making it easier to iterate with the modern JavaScript ecosystem.

## Features

- Player onboarding with class selection and random starter choices
- Structured template data that supports Oozu → Oozuru → Oozuzuru tiers
- Core team management commands for quick playtests
- JSON-backed persistence so state survives restarts

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure the bot**

   - Copy `.env.example` → `.env`
   - Set `OOZU_BOT_TOKEN` to your Discord bot token (the hashed key you shared belongs here)
   - Optionally set `OOZU_GUILD_ID` to limit slash-command registration to a single guild while developing
   - Optionally set `OOZU_COMMAND_PREFIX` (defaults to `!`) for message commands

3. **Launch the bot**

   ```bash
   npm start
   ```

4. **Invite to your server** using the OAuth URL from the Discord Developer Portal. Ensure `MESSAGE CONTENT INTENT` is enabled so prefix commands can function.

> Requires Node.js 18.17 or newer.
> The repository includes a pinned runtime under `tools/node`; run commands through `scripts/dev_shell.sh <command>` or export `PATH="$(pwd)/tools/node/bin:$PATH"` to use it in your session.

### Restarting the Bot

Follow the playbook in `docs/restart.md` for a quick, repeatable restart workflow that stops existing processes before launching a fresh instance.

## Prototype Commands

- `/register` / `!register` – join the arena, choose a class, and pick one of three random starters
- `/team` / `!team` – view your player profile and current Oozu roster
- `/reset` / `!reset` – Admins only; clear a player back to the unregistered state
- `/ping` / `!ping` – quick health check

## Data & Persistence

- `data/oozu_templates.json` defines each template's tier, element, sprite path, base stats, and move set. Extend this file to add new Oozu templates (including higher tiers). Sprites live under `sprites/` (full size) and are scaled automatically for `/team`.
- Player state persists in `data/player_state.json`. It is created on first run; delete it to reset progress.

## Next Steps

- Hook up sprite assets once available and expose them in command responses.
- Expand battle mechanics (status effects, move variety, elemental bonuses).
- Integrate more robust storage (SQL or Hasura) if persistence requirements grow.

Have fun oozing! Contributions and ideas are welcome as we continue shaping the arena.
