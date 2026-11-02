# Fase 12A — Telegram /startentry → Registro diario

## Qué hace
- El bot dedicado Nonna Angela Analytics recibe /startentry **solo en el chat privado y desde el usuario autorizado**.
- Pregunta fecha (AAAA-MM-DD, hoy o ayer), almuerzo abierto/cerrado, comensales, ventas comida, ventas bebidas, base BRUTO/NETO; repite las preguntas para la cena.
- Muestra resumen y requiere CONFIRMAR. /cancel borra la sesión (30 minutos de duración). /help lista los comandos.
- Cada confirmación crea **un registro diario en estado draft**, dos servicios, y una auditoría de origen Telegram. Los datos aparecen en Manager → Analytics → Registro diario.
- Nunca modifica entradas existentes, finalizadas, meses cerrados, gastos, inventario o reservas. No calcula IGIC.
- Esta subfase NO incluye aún importaciones de Excel/CSV ni entrada de gastos por Telegram.

## Deployment, in ordine
1. Unire la PR soltanto dopo test e build. Applicare UNA volta in Supabase SQL Editor il file: supabase/migrations/20261102_create_analytics_telegram_entry.sql. Non applicare la migrazione due volte.
2. Individuare l'account Supabase Analytics autorizzato con questa query:

    SELECT r.user_id, r.role, r.is_active, u.email
    FROM public.analytics_user_roles r
    JOIN auth.users u ON u.id=r.user_id
    WHERE r.is_active=true AND r.role IN ('owner','admin');

3. In Supabase → Edge Functions → Secrets, mantenere i valori ESISTENTI ANALYTICS_TELEGRAM_BOT_TOKEN e ANALYTICS_TELEGRAM_CHAT_ID, e aggiungere i nuovi:
   - ANALYTICS_TELEGRAM_USER_ID: ID utente Telegram autorizzato (nella chat privata, di norma coincide con il Chat ID).
   - ANALYTICS_ENTRY_ACTOR_UID: UUID di un owner/admin Analytics attivo dalla query SQL precedente (NON ID Telegram).
   - ANALYTICS_TELEGRAM_WEBHOOK_SECRET: segreto 32+ caratteri, SOLO caratteri ASCII lettere, numeri, _ e -. Non riutilizzare ANALYTICS_CRON_SECRET.

4. Generare un segreto valido 64 caratteri in PowerShell, senza inserirlo in chat:

    ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))

5. Pubblicare una NUOVA funzione Supabase chiamata analytics-telegram-entry:
   - Dalla CLI (già collegata al progetto): supabase functions deploy analytics-telegram-entry --no-verify-jwt
   - Oppure dal dashboard, nuova Edge Function → codice di supabase/functions/analytics-telegram-entry/index.ts → Verify JWT OFF → Deploy.
   - ATTENZIONE: Netlify e GitHub PR NON pubblicano automaticamente le Edge Functions. NON modificare analytics-digest.
   - JWT OFF è necessario per Telegram, ma il codice verifica sempre il segreto webhook e gli ID chat/sender. Vedi la documentazione Supabase: https://supabase.com/docs/guides/functions/auth

6. Registrare il webhook del NUOVO bot Analytics con PowerShell locale. Inserire i secrets soltanto nei prompt del terminale, mai nel codice GitHub:

    $botToken = Read-Host "BotFather token Analytics"
    $hookSecret = Read-Host "ANALYTICS_TELEGRAM_WEBHOOK_SECRET"
    $functionUrl = "https://PROJECT_REF.supabase.co/functions/v1/analytics-telegram-entry"
    $body = @{
      url = $functionUrl
      secret_token = $hookSecret
      allowed_updates = '["message"]'
      drop_pending_updates = 'true'
      max_connections = '1'
    }
    Invoke-RestMethod -Method Post -Uri ("https://api.telegram.org/bot" + $botToken + "/setWebhook") -Body $body
    Remove-Variable botToken, hookSecret

   Sostituire PROJECT_REF con il riferimento esatto del progetto Supabase Nonna Angela. Se il bot Analytics ha un webhook precedente, questa azione lo SOSTITUISCE; il bot prenotazioni non viene toccato. drop_pending_updates elimina solo vecchi update del bot Analytics.

7. Controlli prima di attivare con dati reali:
   - POST senza header segreto → 401.
   - /startentry via chat Telegram privata → ricevere la prima domanda.
   - Compilare con dati prova e inviare /cancel PRIMA di CONFIRMAR → nessuna giornata salvata.
   - Per la prima giornata con numeri REALI, completare e confermare, poi verificare importi, coperti, status DRAFT e provenienza nel sito. Non finalizzare automaticamente.
   - Una data già registrata deve essere rifiutata e MAI sovrascritta.
   - Verificare il sito dopo eventuale errore prima di ritentare l'invio; il webhook conserva ricevute update per evitare duplicati economici.

## Controlli e limiti
- Sessione scade dopo 30 minuti; input testuale in spagnolo; numeri decimali ammessi con punto o virgola, nessun separatore delle migliaia.
- In Fase 12A un solo utente privato autorizzato. Non aprire il bot Analytics a gruppi o a personale non autorizzato.
- Servizi dichiarati CERRADO dall'utente hanno coperti e vendite 0, non dedotti dal sistema. Le basi fiscali di servizi aperti restano quelle specificate dall'utente; IGIC non calcolata.
- Registro in stato draft: la finalizzazione continua ad essere disponibile soltanto sul sito Analytics.
- Service role e tokens restano esclusivamente in Supabase; l'API RPC è revocata a anon e authenticated. Il database verifica owner/admin prima del salvataggio.
- Retry Telegram può duplicare un messaggio di conferma (solo testo), non il salvataggio dei registri.
