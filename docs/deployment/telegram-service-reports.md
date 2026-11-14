# Reservation bot: lunch and dinner reports

Commands (Atlantic/Canary today):
- /reservashoy — all reservations today.
- /reslunch — today, reservation_time < 17:00:00.
- /resdinner — today, reservation_time >= 17:00:00.
- /reservasdate — ask for a date, then return all services for that date. Inline dates and /reservasfecha alias remain supported.

The service split matches the current website. Special days still use the clock boundary for these two filters. Cancelled/rejected rows stay excluded from active totals; pending/confirmed and service-state display are unchanged. Existing authorized chat and bot token are unchanged.

Validation: actual TypeScript webhook executed with mocked database and Telegram transport, covering boundary times, filtered totals, group-command suffixes, empty service, unauthorized chat, help, date prompt/invalid date/reply/inline date, and Canary summer/winter rollover. No messages or production writes. Full baseline suite: 243 pass, 6 existing TODO.

Release after approval: deploy only telegram-reservations-bot/index.ts with verify_jwt=false (existing webhook configuration). No migration, secrets or webhook URL change. /help lists the new commands; Telegram's separately configured autocomplete menu is not changed. Roll back to previous function version if needed. Production version inspected: 17; manual date prompt in repository also uses ForceReply so group replies can reach the bot.

This PR does not change the existing webhook authentication implementation; broader security review remains part of the audit. Live command-response verification remains pending deployment and authorized test use.
