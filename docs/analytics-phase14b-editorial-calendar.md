# Nonna Angela — Fase 14B: Calendario editoriale, eventi e promozioni

## Obiettivo
Aggiungere **Manager → Analytics → Calendario editorial**, un calendario privato per organizzare in modo concreto il lavoro social e gli eventi: post, Reel, Stories, caroselli, Google Business, eventi e promozioni, con approvazione tracciata prima della pubblicazione/esecuzione.

**Non pubblica nulla** su Instagram o Google Business. Non avvia campagne Ads, non invia email/WhatsApp, non cambia prenotazioni, non crea messaggi ai clienti e non tocca le spese contabili.

## Funzioni
- Calendario mensile, settimana lunedì–domenica, navigazione mese precedente/successivo, conteggio pezzi per giorno e dettaglio selezionato per stato.
- Per ogni contenuto: titolo interno, piattaforma, formato, ruolo responsabile (Marketing, Sala, Cucina o Direzione), lingua, **data/ora locale Atlantic/Canary**, copy, brief visivo, CTA e hashtag.
- Collegamento facoltativo a una campagna del **Growth Planner (14A)**, senza assumere alcuna conversione o spesa. Quando Growth Planner non è leggibile, il calendario rimane utilizzabile senza collegamento.
- Checklist obbligatoria per entrare in revisione: **materiale visivo pronto, copy verificato, fatti/prezzi/orari/allergeni verificati, diritti di immagine e musica verificati**.
- Workflow esplicito: `draft → in_review → approved → published`; da `draft`, `in_review` o `approved` è possibile `cancelled`. Da `in_review` e `approved` si può tornare a `draft`.
- La funzione **Salva** crea o modifica un *draft*. Modificare contenuti in revisione o approvati ne annulla automaticamente l'approvazione e li riporta a `draft`. Contenuti `published` o `cancelled` diventano immutabili.
- Il tasto `Publicado / ejecutado` richiede una **conferma umana esplicita**, possibile solo dopo l'approvazione, e può associare facoltativamente un link HTTPS esterno già pubblicato. Non attiva nessuna integrazione social.
- Lo stato, i cambiamenti e l'identità dell'utente Analytics che agisce vengono registrati in un audit di scrittura senza cancellazioni.
- Controllo `revision` su ogni modifica o transizione: la seconda sessione che prova a salvare una versione ormai superata riceve errore, non sovrascrive il lavoro del collega.

## Modello dati
Migrazione SQL: `supabase/migrations/20261108_analytics_editorial_calendar.sql`.

Richiede che la **Fase 14A sia già installata in Supabase** (per il collegamento opzionale con `public.analytics_growth_campaigns`).

Tabelle private con RLS:
- `public.analytics_editorial_items`: contenuti e workflow.
- `public.analytics_editorial_audit`: storico insert/edit/submit/approve/publish/return_draft/cancel.

Le tabelle sono **senza permessi diretti** per `anon` e `authenticated`; l'app opera tramite RPC `SECURITY DEFINER SET search_path=''` protette da `auth.role()='authenticated'` e `analytics_user_roles` attivo `owner/admin`:
- `analytics_editorial_list(p_start_date date,p_end_date date)`: lettura per intervallo max 63 giorni, max 250 contenuti. Non restituisce gli UUID dei dipendenti che hanno creato/approvato.
- `analytics_editorial_save(p_item jsonb)`: creazione/modifica del draft con validazioni server e controllo `expected_revision`.
- `analytics_editorial_action(p_id uuid,p_expected_revision integer,p_action text,p_published_url text)`: passaggio di stato verificato e registrato. Il server decide se la transizione è lecita, non si affida ai pulsanti visibili.

La data pianificata e l'ora pianificata sono **valori del calendario locale**, non un timestamp UTC. Nessun job usa questi valori per pubblicare automaticamente; evita gli spostamenti di giorno nei cambi ora legale.

## Regole operative consigliate
Per Nonna Angela la strategia corrente prevede circa tre post settimanali, alternando piatti, vini, cocktail, storia del ristorante e UGC quando autorizzato. Questa è una **raccomandazione di calendario**, non un automatismo inserito nel DB.

Esempio di procedura:
1. Lunedì: bozza di un Reel dedicato alla carbonara, in spagnolo.
2. Marketing prepara foto/video e didascalia, inserisce i 5 hashtag indicativi.
3. Sala verifica che i piatti, prezzi e giorni di apertura citati siano corretti.
4. Gerencia controlla uso di immagini/musica e completa la checklist.
5. Il contenuto passa `En revisión`, poi `Aprobado`.
6. Una persona lo pubblica davvero su Instagram o Google Business **fuori dal calendario**.
7. Solo dopo, nel gestionale, spunta `Marcar como publicado / ejecutado`, inserendo se disponibile il link HTTPS di pubblicazione.

I contenuti possono essere preparati con anticipo, ma le checklist vanno spuntate solo se il controllo è realmente completato. Gli eventi sono voci del calendario, **non** creano automaticamente offerte commerciali né prenotazioni.

## Installazione dopo merge
1. Verificare test GitHub + build Netlify verdi della PR 14B, poi fare `Ready for review → Merge pull request`.
2. Nel progetto Supabase **Nonna Angela** aprire **SQL Editor**.
3. Eseguire **una sola volta** il file `supabase/migrations/20261108_analytics_editorial_calendar.sql`.
   - Prerequisito: la migrazione `20261108_analytics_growth_campaigns.sql` della Fase 14A deve già essere stata eseguita, perché esiste un FK a quella tabella.
   - La migrazione 14B è in `BEGIN; ... COMMIT;` e non modifica prenotazioni, Telegram, loyalty o contabilità.
4. Dopo il deploy Netlify di `main`, aprire `Manager → Analytics → Calendario editorial`.
5. Creare un contenuto di prova in bozza, con data nel mese corrente, copy opzionale e checkbox false. Verificare che non compaia `Enviar a revisión`.
6. Inserire almeno 20 caratteri di copy, verificare realmente le quattro voci, salvare. Ora il contenuto può passare `En revisión`.
7. Approvarlo manualmente e verificarne il nuovo stato; **non marcare come pubblicato** se non lo si è davvero pubblicato.
8. Modificare un contenuto approvato: deve tornare a `Borrador` e richiedere nuove approvazioni.
9. Testare il rifiuto di versione vecchia con due sessioni del gestionale e il cambio stato su sessioni diverse.
10. Per una voce di sola prova, imposta `Cancelado` e controlla che non sia più modificabile; rimarrà nell'audit.
11. Confermare che i bot Telegram, prenotazioni e le altre schede Analytics funzionino come prima.

**No Edge Functions, no webhook, no nuove credenziali o secret.**

## Sicurezza e limiti
- Questa funzione non raccoglie dati dei clienti né legge `reservations`. Non usare il copy o il brief per trascrivere informazioni personali, contatti o foto di clienti non autorizzati.
- Le checkbox sono una **attestazione umana**, non un controllo automatico di diritti musicali, licenze fotografiche, allergeni, prezzi o veridicità del contenuto.
- `approved` significa approvato in gestionale; non dimostra che il post esista su Instagram.
- `published` significa **marcato manualmente** come pubblicato/eseguito; non abbiamo un connettore che ne verifichi l'esistenza reale.
- Il ruolo responsabile indica un team, non assegna task o invia notifiche a persone specifiche.
- Non c'è approvazione a due persone obbligatoria: owner/admin possono approvare. Se serve doppia firma in futuro, va progettata prima di affermare che è attiva.
- Non c'è upload di media: si inserisce un brief e si gestisce foto/video negli strumenti autorizzati. I link pubblici opzionali devono essere HTTPS.

## Prossimi passi
- **14C (se utile):** libreria creatività/asset e riuso dei migliori contenuti, con corretta gestione dei diritti e senza inventare collegamenti ai risultati Ads.
- **14D (se utile):** sincronizzazione dati di piattaforme esterne *solo* con integrazioni ufficiali e permessi adeguati.
- Il sistema di gestione Analytics, prenotazioni e loyalty non viene auditato globalmente in questa PR, per rispettare la roadmap. I problemi di sicurezza critici confermati richiedono rimedio immediato, indipendentemente dall'audit finale.
