# Fase 11 — Nonna Angela Analytics: notifiche e automazioni

## Scopo
- Generare un riepilogo **giornaliero** dei registri del giorno precedente.
- Generare il **lunedì** un riepilogo della settimana precedente (lunedì–domenica).
- Visualizzare messaggi nella casella interna **Manager → Analytics → Notificaciones**.
- Consentire opzionalmente l'invio Telegram, SOLO a un chat ID finanziario autorizzato.
- Niente vendite, previsioni di profitto o confronti di obiettivi derivati da dati incompleti.
- Niente scritture nelle tabelle prenotazioni o nelle registrazioni finanziarie.

## Sicurezza e comportamento di default
1. `analytics_notification_settings.enabled = false`: **OFF** dopo la migrazione.
2. Telegram è separatamente disabilitato e usa **ANALYTICS_TELEGRAM_BOT_TOKEN** e **ANALYTICS_TELEGRAM_CHAT_ID** dedicati. L'Edge Function rifiuta lo stesso token del bot prenotazioni.
3. RPC di generazione e invio accessibili **solo al ruolo service_role**; le preferenze sono modificabili solo dai ruoli Analytics owner/admin tramite `analytics_has_permission('analytics.write')`.
4. Un `ANALYTICS_CRON_SECRET` distinto (casuale, **almeno 32 caratteri**) protegge l'Edge Function HTTP: `verify_jwt=false` è intenzionale per permettere chiamate schedulate, ma non rimuove la verifica del secret nell'handler.
5. Chi ha accesso owner/admin a Analytics può leggere l'inbox. Le marcature di lettura sono individuali.
6. Ogni coppia *(cadence, local_run_date)* è unica; le chiamate duplicate non generano messaggi doppi. Le consegne Telegram sono prenotate atomicamente prima della chiamata HTTP (al massimo un tentativo). Gli errori o l'esito ambiguo non generano retry automatici.
7. Le notifiche non sono allegati contabili, non includono dati identificativi dei clienti né importi di profitto.
8. `workflow_dispatch` può eseguire manualmente il worker, ma la data viene SEMPRE calcolata lato server in `Atlantic/Canary`. Non si possono falsificare le date dal body.

## Checklist di pubblicazione (nell'ordine)
1. Verificare CI GitHub (test e build), Deploy Preview, homepage, menù, prenotazioni e login Analytics.
2. Applicare **una sola volta** `supabase/migrations/20261102_create_analytics_notifications.sql` nel progetto Supabase corretto. Verificare `Success`.
3. Provare la scheda **Notificaciones**: preferenze (sistema OFF), anteprima senza invio, salvataggio preferenze lasciando inizialmente `enabled=false`, lista vuota e accesso non autorizzato.
4. Preparare e mantenere privati i secrets, **senza inserirli nel repository né in chat**:
   - Supabase Edge Function secrets: `ANALYTICS_CRON_SECRET` (32+ caratteri); `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono resi disponibili dalla piattaforma Supabase in ambiente Edge.
   - Solo se si desidera Telegram: `ANALYTICS_TELEGRAM_BOT_TOKEN` (bot separato, creato con **@BotFather**) e **ANALYTICS_TELEGRAM_CHAT_ID** (chat privato autorizzato, verificato). **Non usare il bot prenotazioni.**
   - GitHub Actions repository secrets: `ANALYTICS_CRON_SECRET` (stesso valore) e `ANALYTICS_DIGEST_URL` nel formato esatto `https://PROJECT_REF.supabase.co/functions/v1/analytics-digest`.
5. Distribuire l'Edge Function nel progetto giusto **con autenticazione JWT disabilitata per questa funzione soltanto**: `supabase functions deploy analytics-digest --no-verify-jwt`. L'handler controlla SEMPRE il secret.
6. Provare con preferenze ancora OFF: l'invocazione autenticata deve restituire un riepilogo senza notifiche (reason: disabled). La chiamata senza secret deve restituire HTTP 401. Evitare messaggi Telegram reali durante questo test.
7. La PR #19 della Fase 11 è già stata unita a main: applicare la PR correttiva sulla separazione del bot solo dopo CI/preview, attendere Netlify `Published` e verificare le prenotazioni pubbliche.
8. **Solo dopo** attivare le notifiche dall'interfaccia. La programmazione GitHub Actions è alle **09:15 UTC** (09:15 inverno / 10:15 estate alle Canarie); GitHub può eseguire i cron in ritardo. È possibile avviare il workflow manualmente senza cambiare la data di riferimento.
9. Verificare una notifica interna reale dopo l'esecuzione; controllare i log di consegna Telegram solo se si è attivato quel canale. Le consegne fallite sono conservate con stato `failed` e non sono ripetute automaticamente.

## Limiti espliciti
- **Non è una notifica push del browser** e non invia email. Questo rilascio offre una casella interna persistente e un invio Telegram opzionale.
- L'alert engine di Fase 10 resta *on-demand* e si usa in `Alertas`. I digests schedulati includono soltanto coperti dei registri finalizzati, copertura delle registrazioni e bozze in sospeso: non richiedono che gli obiettivi siano stati inseriti.
- Non interpreta automaticamente i giorni senza registrazione come giorni aperti senza clienti; per evitarne falsi allarmi non genera messaggi se il periodo non contiene alcuna giornata.
- Per cambi di orario o destinatario si aggiornano configurazioni server e workflow: le preferenze dell'interfaccia non cambiano la frequenza del cron.
- Il test completo dei cron e delle consegne richiede un deploy reale dell'Edge Function e dei secrets; **non è validato dalla sola build Vite**.


## Creazione del bot dedicato (quando desideri Telegram)
1. Nell'app Telegram apri **@BotFather**, invia `/newbot`, scegli nome pubblico `Nonna Angela Analytics` e uno username che termini con `bot`, unico e disponibile.
2. Copia il token **esclusivamente** in Supabase → Edge Functions → Secrets, come `ANALYTICS_TELEGRAM_BOT_TOKEN`. Non inserirlo in GitHub, documenti, chat, screenshot o codice.
3. Crea un nuovo chat/gruppo privato autorizzato oppure usa un chat privato con il bot. Aggiungi il bot, avvia la conversazione e recupera il suo `chat_id` in modo sicuro. Imposta **ANALYTICS_TELEGRAM_CHAT_ID** nei secrets Supabase. Non usare il chat delle prenotazioni.
4. Verifica che il bot Analytics possa inviare messaggi al destinatario scelto. Lascia `telegram_enabled=false` finché autorizzazione, secret e test negativo 401 sono confermati.
5. Ruota/revoca immediatamente il token su BotFather se appare accidentalmente in screenshot, chat o log. Dopo un'eventuale rotazione aggiorna il secret in Supabase.

**Nota:** i secrets GitHub del cron `ANALYTICS_CRON_SECRET` e `ANALYTICS_DIGEST_URL` non contengono né richiedono il token BotFather. Il token del bot resta soltanto su Supabase.

## Smoke test Telegram isolato — senza attivare gli automatismi

Dopo aver creato il bot Analytics su BotFather, inviato `/start` nella chat privata e salvato in **Supabase → Edge Functions → Secrets** sia `ANALYTICS_TELEGRAM_BOT_TOKEN` sia `ANALYTICS_TELEGRAM_CHAT_ID`:

1. **Non attivare** `enabled` o `telegram_enabled`. In `SQL Editor` verifica che entrambi siano `false` con:
   `SELECT enabled, telegram_enabled FROM public.analytics_notification_settings WHERE singleton=1;`
2. Unisci questa PR dopo CI e preview. La funzione su Supabase NON si aggiorna automaticamente tramite Netlify: apri l'editor di **analytics-digest**, sostituisci il codice con `supabase/functions/analytics-digest/index.ts` da `main` e premi **Deploy updates** (in alternativa usa la CLI Supabase).
3. Su **analytics-digest → Test** imposta **POST**, header `x-analytics-cron-secret` con lo stesso valore privato presente in Supabase, e body JSON esatto:
   `{"mode":"telegram_test","confirm":"SEND_ONE_TEST_MESSAGE"}`
4. Premi **Send Request** **una sola volta**. Se il bot può inviare nel chat autorizzato, restituisce:
   `{"ok":true,"mode":"telegram_test","delivered":true,"autoNotificationsEnabled":false}`
   e compare un messaggio sul bot. Non viene generata nessuna notifica di digest né registrato alcun dato economico.
5. In caso di `502`, verifica se hai premuto **Start** sul bot, l'ID corretto del chat (e.g. un gruppo usa ID negativo), che il bot non sia bloccato e che i secrets siano salvati correttamente. Non reinviare in automatico: controlla il chat prima di un nuovo tentativo.
6. Con l'interfaccia **Notificaciones** ancora spenta, prova nuovamente GitHub Actions manualmente: dovrebbe mostrare `created:0`, `delivered:0`. Solo successivamente valuta la programmazione reale.

**Sicurezza:** la modalità di test è protetta dall'header secret, da una stringa di conferma esplicita e dal blocco quando gli automatismi sono attivi. Ogni invocazione valida invia **un solo** messaggio, ma non c'è un rate limit persistente: non esporre il secret, non condividere schermate degli header, e non ripetere test inutilmente. Il test non certifica che sia stato inviato un riepilogo giornaliero vero.
