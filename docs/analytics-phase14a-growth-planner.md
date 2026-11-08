# Nonna Angela — Fase 14A: Growth & Campaign Planner

## Obiettivo
Creare in **Manager → Analytics → Growth Planner** un archivio operativo per le campagne di marketing (Instagram, Google Ads, Google Business, contenuti organici, attività in sala, eventi e altri canali), senza API esterne, bot o dati personali dei clienti.

Il modulo serve a decidere e controllare *cosa fare*, *quanto prevediamo di spendere* e *quali risultati vengono dichiarati manualmente*. Le differenze tra dati noti, mancanti e stimati sono esplicite. Non è un motore che pubblica campagne, genera prenotazioni o determina il fatturato attribuibile.

## Funzioni
- Nuova campagna con nome, canale, obiettivo, turno target (almuerzo/cena/ambos), periodo, stato manuale, budget previsto, costo effettivo dichiarato, codice eventuale e note operative.
- Metriche **facoltative e manuali**: impressioni, clic, consultazioni ricevute, numero di prenotazioni con codice dichiarate dal personale. Campi vuoti = dato sconosciuto; il valore 0 significa un dato dichiarato pari a zero.
- **Un codice campagna non è integrato automaticamente nelle prenotazioni**. Il numero `code_bookings` è una registrazione manuale che richiede controllo del codice presso il personale; NON è una conversione misurata da Ads, Google Analytics o Supabase.
- Dashboard per budget previsti, spesa dichiarata e copertura dei dati; numero campagne per canale. CTR, CPC e costo per prenotazione *dichiarata con codice* sono calcolati solo con denominatori disponibili e diversi da zero. Non si calcola ROI, utile netto o fatturato attribuito.
- Promemoria di verifica del superamento budget e dei costi ancora non dichiarati. Mai assumere che una campagna in stato `running` sia stata pubblicata o conclusa davvero.
- Collegamento alla scheda **Tendencias clientes** della Fase 13B per leggere la domanda e *valutare manualmente* i periodi deboli. Senza legame causale fra andamento delle prenotazioni e campagne.
- Modifiche effettuate tramite RPC con versione `revision`: se un altro manager ha aggiornato nel frattempo, il server rifiuta la sovrascrittura e richiede reload. L'audit registra versione precedente e nuova e l'utente Analytics che ha cambiato i dati.
- Nessun tasto di cancellazione: per escludere una campagna dalla pianificazione, impostare lo stato `cancelled`. Il record e l'audit rimangono tracciabili.

## Database e autorizzazioni
Migrazione: `supabase/migrations/20261108_analytics_growth_campaigns.sql`.

Tabelle:
- `analytics_growth_campaigns`: dati di pianificazione e risultati dichiarati, date, canale, revisioni e autore.
- `analytics_growth_audit`: eventi `insert`/`update`, prima/dopo, timestamp, autore.

RPC private:
- `analytics_growth_list(p_start_date date,p_end_date date)`: solo aggregati e righe di campagna, filtro sulle date che si intersecano, max 200 righe, intervallo massimo 367 giorni calendario.
- `analytics_growth_save(p_campaign jsonb)`: validazione server, create/update atomici, audit e controllo revisione.

Si usano `SECURITY DEFINER`, `search_path=''` e `analytics_growth_editor()` che autorizza solo `authenticated` con ruolo `owner`/`admin` attivo nel sistema Analytics. Le due tabelle hanno RLS abilitata e nessun accesso diretto `anon`/`authenticated`: le operazioni passano solo tramite le RPC. Nessun accesso a `reservations`, nomi, telefoni, email, fatture, spese Analytics o alle tabelle Loyalty.

## Significato delle metriche
- `planned_budget`: budget **programmato**, non un costo contabilizzato.
- `actual_spend`: costo **dichiarato manualmente** dall'operatore, non verificato da un connettore Ads né riconciliato con fatture.
- `impressions`/`clicks`: valori trascritti da una fonte esterna, **non scaricati** automaticamente.
- `inquiries`: richieste di informazioni conteggiate manualmente.
- `code_bookings`: prenotazioni **dichiarate** con un codice, non confermate per via automatica da un booking_id e non necessariamente un incremento causato dalla pubblicità.
- `CTR` = clic/impressioni ×100, solo se impressioni e clic sono noti e impressioni >0.
- `CPC` = costo dichiarato/clic, solo se il dato costo e clic è presente e clic >0.
- `Costo per prenotazione con codice dichiarata` = costo dichiarato/prenotazioni con codice dichiarate, solo se il dato costo e prenotazioni è presente e prenotazioni >0.
- Un totale con una o più campagne senza costo dichiarato è indicato come **parziale**, non viene scambiato per il costo totale reale.

**Non scrivere nelle note nomi, telefoni, email, richieste dei clienti o dati personali.**

## Installazione e test

1. Aprire la PR della Fase 14A e attendere test GitHub + build Netlify verdi, poi fare `Ready for review → Merge pull request`.
2. Aprire il progetto Supabase **Nonna Angela** → SQL Editor e applicare **una sola volta** la migrazione `20261108_analytics_growth_campaigns.sql`.
3. Aspettare il deploy Netlify da `main`, aggiornare il browser e aprire **Manager → Analytics → Growth Planner**.
4. Creare una campagna di **prova interna** con stato `draft`, budget 0€, date attuali e valori metriche tutti vuoti. Questo NON creerà una campagna reale su Instagram o Google.
5. Controllare che nella tabella il budget sia 0€ e che i dati di performance restino «—», non zero inventato.
6. Modificare il nome o lo stato della campagna: deve incrementare il numero di revisione e lasciare un audit record, senza modificare il registro spese.
7. Provare con una seconda sessione admin ad aggiornare la stessa campagna: il salvataggio con revisione superata deve fallire, invece di sovrascrivere silenziosamente.
8. Provare una data impossibile, un budget negativo, metriche decimali, `code_bookings>0` senza `tracking_code`: il sistema deve rifiutare il salvataggio.
9. Per rendere inattiva la campagna interna, scegliere lo stato `cancelled`. Non è prevista la cancellazione automatica dei record/audit.
10. Verificare che un utente anonimo o non Analytics owner/admin non possa chiamare `analytics_growth_list`/`analytics_growth_save` e non possa effettuare operazioni SQL dirette sulle nuove tabelle.
11. Controllare che prenotazioni, Telegram, Loyalty e le dashboard precedenti non siano state alterate.

**Non occorrono nuove Edge Functions, webhook, segreti Supabase, accessi Google Ads o Instagram.**

## Cosa NON è
- Non è un CRM, non invia comunicazioni e non gestisce consensi o dati cliente.
- Non è un calendario di pubblicazione automatica e non crea inserzioni pubblicitarie.
- Non attribuisce vendite o prenotazioni direttamente alle campagne senza prova. Non calcola ROI né margine incrementale.
- Non risolve il problema preesistente delle policy RLS delle prenotazioni. Un'esposizione critica confermata di dati personali deve essere sistemata anche prima dell'audit funzionale generale.

## Roadmap
- **14A** — Growth & Campaign Planner: questa PR.
- **14B (possibile)** — calendario editoriale multicanale, checklist approvazione e calendario eventi, senza pubblicazione automatica.
- **14C (possibile)** — integrazione di metriche Ads ufficiali/UTM e dati booking, solo quando il modello dati e le autorizzazioni consentono attribuzioni dimostrabili.
- Audit funzionale globale del sito dopo lo sviluppo dell'ecosistema, come concordato; criticità di sicurezza confermate richiedono remediation indipendente.
