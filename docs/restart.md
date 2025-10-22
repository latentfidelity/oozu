# Restart Playbook

Use this checklist whenever you need to bounce the Oozu bot without getting stuck in half-running states.

> **Important:** Only one bot process should ever be running for a given Discord token. Before restarting locally, make sure any other servers (old Python builds, previous dev laptops, production boxes, etc.) have been shut down or are using a different token.

## 1. Verify configuration
- Confirm `.env` includes a valid `OOZU_BOT_TOKEN` (reset in the Discord portal if unsure).
- Optional: check `OOZU_GUILD_ID` matches the target server.

## 2. Ensure dependencies are installed
```bash
npm install
```

## 3. Confirm no other bot processes are running

Run the helper script while on the host that should be active:

```bash
./scripts/restart_bot.sh
```

The script now ensures:
1. Any local `node src/index.js` instances are terminated (forcefully if necessary).
2. Legacy Python processes such as `python -m oozuarena.app` are stopped.
3. It refuses to launch if *any* prior bot process is still running.

If the script exits with an error about remaining processes, stop those first (or log into the other machine and shut them down) before retrying.

## 4. Restart using the helper script
```bash
./scripts/restart_bot.sh
```

The script performs the following once all prior processes are gone:
1. Stops any existing `node src/index.js` process.
2. Stops any legacy Python `oozuarena.app` processes.
3. Starts a fresh instance with your system `node` binary.
4. Streams basic status logs so you can confirm the bot logged in successfully.

> Tip: the script is idempotent—run it again any time you want to redeploy changes.

Prefer the script so logs persist to `logs/oozu_bot.log`, but you can also run a one-off foreground session via:
```bash
npm start
```
Press `Ctrl+C` to stop the foreground process.

## 4. Validate in Discord
- Run `/ping` to confirm the bot responds.
- Use `/register` or `/team` to make sure slash commands synced to your guild.
