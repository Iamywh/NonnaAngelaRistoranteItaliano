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
2. Telegram è separatamente disabilitato e usa **ANALYTICS_TELEGRAM_CHAT_ID**, mai il chat di prenotazioni di default.
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
   - Solo se si desidera Telegram: `TELEGRAM_BOT_TOKEN` (bot esistente o dedicato) e **ANALYTICS_TELEGRAM_CHAT_ID** (nuovo chat privato autorizzato, verificato).
   - GitHub Actions repository secrets: `ANALYTICS_CRON_SECRET` (stesso valore) e `ANALYTICS_DIGEST_URL` nel formato esatto `https://PROJECT_REF.supabase.co/functions/v1/analytics-digest`.
5. Distribuire l'Edge Function nel progetto giusto **con autenticazione JWT disabilitata per questa funzione soltanto**: `supabase functions deploy analytics-digest --no-verify-jwt`. L'handler controlla SEMPRE il secret.
6. Provare con preferenze ancora OFF: l'invocazione autenticata deve restituire un riepilogo senza notifiche (reason: disabled). La chiamata senza secret deve restituire HTTP 401. Evitare messaggi Telegram reali durante questo test.
7. Quando si è verificato il destinatario e il corretto deploy, rendere la PR `Ready for review` e fare merge; attendere Netlify `Published`, verificare le prenotazioni pubbliche.
8. **Solo dopo** attivare le notifiche dall'interfaccia. La programmazione GitHub Actions è alle **09:15 UTC** (09:15 inverno / 10:15 estate alle Canarie); GitHub può eseguire i cron in ritardo. È possibile avviare il workflow manualmente senza cambiare la data di riferimento.
9. Verificare una notifica interna reale dopo l'esecuzione; controllare i log di consegna Telegram solo se si è attivato quel canale. Le consegne fallite sono conservate con stato `failed` e non sono ripetute automaticamente.

## Limiti espliciti
- **Non è una notifica push del browser** e non invia email. Questo rilascio offre una casella interna persistente e un invio Telegram opzionale.
- L'alert engine di Fase 10 resta *on-demand* e si usa in `Alertas`. I digests schedulati includono soltanto coperti dei registri finalizzati, copertura delle registrazioni e bozze in sospeso: non richiedono che gli obiettivi siano stati inseriti.
- Non interpreta automaticamente i giorni senza registrazione come giorni aperti senza clienti; per evitarne falsi allarmi non genera messaggi se il periodo non contiene alcuna giornata.
- Per cambi di orario o destinatario si aggiornano configurazioni server e workflow: le preferenze dell'interfaccia non cambiano la frequenza del cron.
- Il test completo dei cron e delle consegne richiede un deploy reale dell'Edge Function e dei secrets; **non è validato dalla sola build Vite**.
