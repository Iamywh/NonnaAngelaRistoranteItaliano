# Fase 12B/1 — /startexpense su Telegram Analytics

## Obiettivo
Estendere il bot Analytics privato già funzionante con un **secondo formulario** per registrare i **totali delle spese per categoria e periodo**. Non si tratta di fatture singole: la tabella attuale `analytics_expenses` consente esattamente **un totale** per `(period_kind, period_date, category)`.

Questa prima consegna della 12B **non comprende ancora l'importazione Excel/CSV o il Data Quality Center**. Questi sono i passi successivi della 12B.

## Comandi
- `/startentry` — registra entrate giornaliere, come in 12A (nessuna modifica di comportamento).
- `/startexpense` — apre il nuovo formulario per un totale di spesa.
- `/cancel` — cancella il formulario attivo, senza scrivere contabilità.
- `/help` — elenca i due formulari.

Il formulario spese chiede **diario/mensual**, data (giornaliera: AAAA-MM-DD/hoy/ayer; mensile: AAAA-MM), categoria (1–12), importo positivo in €, base BRUTO/NETO, eventuale IGIC **dichiarato** (oppure NO se non verificato), note facoltative e conferma esplicita **CONFIRMAR**. Sessione di 30 minuti. Tutti i testi verso Telegram sono in spagnolo.

### Regole contabili
- Importi a due decimali, nessuna conversione automatica da lordo a netto e **nessuna IGIC stimata**.
- Non inserisce importi in mesi chiusi.
- Se esiste già una riga con quella categoria nello stesso giorno/mese, **non la modifica e non la somma**. Per rettificare un totale esistente, usare `Manager → Analytics → Gastos` tramite l'RPC auditato già presente.
- In caso di due fatture di alimenti nello stesso giorno, calcolarne il totale verificato prima di usare il bot, oppure aggiornare il totale dal sito.
- Registra `created_by`/`updated_by` come utente Analytics owner/admin configurato; scrive sia `analytics_expense_audit` sia `analytics_telegram_expense_audit`.
- L'ID Telegram `update_id` è ricevuto in una tabella unica condivisa da entrambi i formulari. Un retry non crea doppie spese.
- Non crea/modifica prenotazioni, fatture, inventario o entrate giornaliere.
- Il bot resta **esclusivamente privato**, limitato al chat ID e user ID autorizzati. La RPC resta eseguibile soltanto da `service_role`.

## Messa in produzione — ordine obbligatorio

1. Attendere test e build verdi della PR; effettuarne il merge su GitHub.
2. Aprire **Supabase → SQL Editor** del progetto corretto e incollare **interamente**:
   `supabase/migrations/20261107_add_analytics_telegram_expense_entry.sql`.
   Eseguire **una volta**, dopo la migrazione già applicata di 12A e la migrazione `analytics_expenses`.
   La migration aggiunge una colonna ricevuta, una tabella di provenienza e aggiorna `analytics_telegram_entry_process`; è in una singola transazione.
3. Pubblicare nuovamente **la stessa Edge Function** `analytics-telegram-entry` con il contenuto aggiornato di `supabase/functions/analytics-telegram-entry/index.ts`.
   - CLI del progetto Supabase già collegato: `supabase functions deploy analytics-telegram-entry --no-verify-jwt`.
   - Oppure Dashboard → Edge Functions → `analytics-telegram-entry` → editor → sostituisci codice → Deploy. **Verify JWT OFF** come già prima, perché Telegram usa il secret header.
   - **Non cambiare** URL, webhook Telegram, token, chat ID, secret header, ruoli, bot delle prenotazioni, `analytics-digest`, policy di prenotazione o variabili di Netlify.
   - GitHub e Netlify non pubblicano le Supabase Edge Functions in automatico.
4. Verificare nel bot dedicato Analytics:
   - `/help` deve elencare `/startexpense`.
   - `/startexpense` → DIARIO → hoy → categoria libera → 12,34 → BRUTO → NO → nota → appare il riepilogo; **usare /cancel prima di CONFIRMAR** per questa prova. Niente spesa reale deve essere scritta.
   - Completare **una sola spesa con importi REALI**, scrivere `CONFIRMAR`, verificare in Manager → Analytics → Gastos, stessa data/categoria/base/IGIC e che audit sia registrato.
   - Ripetere categoria e data già presenti: il bot deve **rifiutare** l'inserimento senza sostituire il totale.
   - Provare un mese chiuso, se disponibile: il bot deve **rifiutare** prima di confermare.
   - Provare `/startentry` e poi `/cancel` per assicurarsi che il formulario entrate funzioni ancora.
5. Se il bot non risponde o compare errore 503, controllare **Supabase Edge Functions → Logs** e che la SQL migration sia stata applicata per intero; non ri-configurare alla cieca i webhook (sono due bot distinti). Non condividere in chat secrets o dati dei clienti.

### Verifica facoltativa lettura, senza modificare dati
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'analytics_telegram_entry_updates'
  AND column_name = 'saved_expense_id';

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'analytics_telegram_expense_audit';
```

## Limitazioni consapevoli
- Il file SQL è progettato per gli schemi esistenti in questo repository; prima di eseguirlo in produzione verificare che le migrazioni 12A/Expenses siano già applicate.
- Il sito resta la fonte di verità per correzioni dei totali esistenti e verifica delle imposte.
- Importazione multipla Excel/CSV e Data Quality Center sono le due parti **ancora aperte** della Fase 12B.
- L'audit globale del sito rimane previsto dopo il completamento delle funzionalità. Le eventuali vulnerabilità critiche emerse nel frattempo richiedono comunque intervento prioritario.
