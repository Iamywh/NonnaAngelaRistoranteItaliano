# Nonna Angela — Fase 13A: Customer Intelligence (aggregati prenotazioni)

## Obiettivo
Integrare una nuova pagina **Manager → Analytics → Customer Intelligence** per leggere, senza modificare, le tendenze di prenotazione e i segnali di presenza al servizio.

Questa è **Fase 13A**, prima tranche di Customer Intelligence. Le fasi successive potranno ampliare le analisi commerciali usando dati verificati e autorizzati; non si attiva alcun CRM nominativo o marketing automatico in questa consegna.

## Funzionalità incluse
- KPI mensili per **data della prenotazione**: richieste, pending, confirmed, cancelled, rejected, posti richiesti per prenotazioni pending+confirmed, arrivi marcati `seated/completed`, no-show marcati esplicitamente, prenotazioni passate ancora `not_arrived`.
- Domanda per pranzo/cena/altri orari, per giorno della settimana e per data.
- Anticipo delle richieste: stesso giorno, 1–2, 3–7, 8+ giorni, creazione posticipata o data non presente.
- Provenienza dichiarata `source`: `website` **include il modulo pubblico e il Virtual Agent**, perché entrambi salvano `source='website'`. Non è possibile separarli in modo attendibile con i dati attuali.
- Preferenze di contatto `confirmation_channel`, **non** consegne/risposte effettive dei messaggi.
- Segnali utili: prenotazioni vecchie senza stato, no-show marcati, orari fuori standard e stati non classificabili.
- Contesto **separato** dei coperti annotati nel Registro Diario Analytics, che possono includere walk-in e giorni incompleti.

## Definizioni da NON confondere
- **Richiesta**: prenotazione presente sul database, qualunque sia lo stato.
- **Prenotazione attiva**: stato `pending` oppure `confirmed`; non è sinonimo di cliente arrivato.
- **Arrivato**: prenotazione attiva con `service_status='seated'` oppure `completed`, esplicitamente marcata dal personale.
- **No-show**: prenotazione attiva con `service_status='no_show'`, esplicitamente marcata dal personale. Una prenotazione passata ancora `not_arrived` NON è automaticamente un no-show.
- **Tasso no-show tra casi classificati**: `no_show/(arrived+no_show)`. Non è la percentuale reale su tutte le prenotazioni quando esistono stati irrisolti; è indicata chiaramente con il suo denominatore.
- **Plazas solicitadas**: somma `guests` delle prenotazioni attive; NON è occupazione misurata, capacità effettiva o coperti reali.
- **Ticket medio cliente**: NON è calcolato. I ricavi e i coperti finanziari non sono collegati a identificatori di prenotazione o scontrini TPV verificati. Mai assegnare ricavi a clienti individuali usando medie arbitrarie.
- Non viene calcolata la conversione visitatori→prenotazioni né il tasso di ritorno clienti; questi indicatori richiedono dati ulteriori e una valutazione privacy.

## Architettura e sicurezza
Nuova funzione:
`public.analytics_customer_intelligence(p_month_start date)` (PostgreSQL, `SECURITY DEFINER`, `search_path=''`).

- Solo `authenticated` con permesso `public.analytics_has_permission('analytics.read')`.
- La funzione legge righe private di `public.reservations` **dentro Supabase** e restituisce solo contatori, somme e raggruppamenti. Non restituisce nome, email, telefono, note, identificativi o righe individuali.
- RLS, policy e privilegi esistenti delle prenotazioni non vengono né ampliati né disabilitati.
- La funzione aggrega separatamente i coperti della contabilità giornaliera, senza unirli ai clienti o presentarli come presenze delle prenotazioni.
- Il codice UI usa **una RPC** di Supabase, non `.from('reservations').select(...)`.
- Tutte le operazioni sono in sola lettura. Nessuna nuova Edge Function o webhook Telegram.

**Rischio preesistente fuori scope:** alcune policy pubbliche di SELECT/UPDATE sulle prenotazioni viste in precedenza sembrano troppo ampie e richiedono una correzione dedicata della sicurezza. La presente RPC **non risolve** quel rischio e non deve essere considerata il via libera per CRM nominativo/marketing. È consigliabile contenerlo appena verificato, anche se l'audit finale completo del sito è pianificato più avanti.

## Attivazione dopo PR e CI verde
1. Aprire la PR Fase 13A, verificare test e build, fare `Ready for review → Merge`.
2. Aprire **Supabase → SQL Editor** del progetto Nonna Angela e applicare **una sola volta** l'intero file:
   `supabase/migrations/20261107_analytics_customer_intelligence.sql`
   (è una `CREATE OR REPLACE FUNCTION` in transazione, quindi consente il riallineamento in caso di redeploy controllato).
3. Aspettare il deploy Netlify di main, aggiornare il browser con `Ctrl + Shift + R`.
4. Entrare in **Manager → Analytics → Customer Intelligence** usando l'account Analytics owner/admin.
5. Provare almeno un mese con prenotazioni e uno senza:
   - Confermare i conteggi `pending`, `confirmed`, `cancelled`, `rejected` confrontandoli con il gestore delle prenotazioni (senza modificare dati).
   - Verificare che una prenotazione passata ancora `not_arrived` figuri come **da verificare**, non automaticamente come no-show.
   - Controllare i turni, i giorni della settimana, gli orari fuori standard e la fonte `website`.
   - Verificare che il numero coperti del Registro Diario sia visualizzato **separatamente**, e che la pagina non mostri PII.
   - Confermare che il modulo prenotazioni pubblico e i due bot Telegram non abbiano avuto modifiche.
6. Se compare `Could not find the function` o HTTP 404 nella pagina, la migrazione non è stata applicata o PostgREST non ha ancora ricaricato lo schema. Non inserire nuovi secrets, né modificare i webhook.

### Controllo read-only SQL
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='analytics_customer_intelligence';
```

## Passi successivi suggeriti
- **13B:** confronto dei mesi, coperti/presenze con dati completi, segmentazione aggregata per fascia oraria e opportunità commerciali.
- **13C (eventuale):** loyalty/CRM con consenso informato e controlli di accesso adeguati, dopo remediation dei permessi prenotazioni e definizione privacy.
- **Audit generale del sito:** a fine sviluppo funzionale, come concordato; eventuali falle già confermate non vanno ignorate nel frattempo.

## Limitazioni di test
I test CI verificano i calcoli frontend, la forma delle autorizzazioni della RPC, la build e l'assenza di accessi PII in questa feature. Non equivalgono a un'esecuzione reale della migrazione su Supabase: il collaudo con dati effettivi va fatto dopo deploy.
