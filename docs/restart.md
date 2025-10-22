# Restart Playbook

Use this checklist whenever you need to bounce the Oozu bot without getting stuck in half-running states.

## 1. Verify configuration
- Confirm `.env` includes a valid `OOZU_BOT_TOKEN` (reset in the Discord portal if unsure).
- Optional: check `OOZU_GUILD_ID` matches the target server.

## 2. Ensure dependencies are installed
```bash
npm install
```

## 3. Restart using the helper script
```bash
./scripts/restart_bot.sh
```

The script performs the following:
1. Stops any existing `node src/index.js` process.
2. Starts a fresh instance with your system `node` binary.
3. Streams basic status logs so you can confirm the bot logged in successfully.

> Tip: the script is idempotent—run it again any time you want to redeploy changes.

Prefer the script so logs persist to `logs/oozu_bot.log`, but you can also run a one-off foreground session via:
```bash
npm start
```
Press `Ctrl+C` to stop the foreground process.

## 4. Validate in Discord
- Run `/ping` to confirm the bot responds.
- Use `/register` or `/team` to make sure slash commands synced to your guild.
