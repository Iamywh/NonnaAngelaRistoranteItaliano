# Nonna Angela — Fase 13C/2 · La Famiglia Loyalty Intelligence

## Scopo commerciale
La Famiglia è già un programma di tessere digitali emesse dal personale, con un timbro per visita verificata e premio riscattabile dopo un numero definito di timbri. Il programma pilota non associa la tessera a nomi, email, numeri di telefono o identificativi di prenotazione.

Questa fase aggiunge un **controllo economico gestionale e di ripetizione osservata**, senza introdurre un CRM nominativo o marketing automatico. La priorità è non regalare margine senza misurare il costo dei premi.

La dashboard si trova in **Manager → Analytics → Loyalty Intelligence**, separata dalla scheda operativa **La Famiglia**.

## Funzioni implementate
La nuova dashboard privata, disponibile esclusivamente a utenti Supabase Analytics `owner`/`admin`, mostra:
- Tessere emesse nel mese selezionato (di calendario, secondo fuso `Atlantic/Canary`).
- Timbri/visite verificati, numero di tessere distinte con almeno una visita nel mese.
- **Tessere tornate** nel mese: carte con almeno una visita nel mese e almeno una **visita precedente a quel mese**. È solo ripetizione osservata tra le tessere, non retention di tutti i clienti del ristorante.
- Premi effettivamente marcati come *consegnati* nel mese e saldo **attuale** dei premi maturati ma non riscattati delle tessere attive.
- Distribuzione delle tessere attualmente esistenti per numero di visite: 0, 1, 2, 3–4, 5+.
- Attività timbrature per data.
- Elenco di tipi di premio **già emessi** (descrizione+numero timbri) e importo **stimato** di costo diretto per premio, configurabile da owner/admin.

### Ipotesi di costo economico
Per ogni tipo di offerta (premio descritto + soglia), l'owner può assegnare manualmente un valore tra `0,00 €` e `1.000,00 €` con due decimali, oppure lasciare il campo vuoto = **costo non verificato / nessuna stima**.

I valori **non rappresentano fatture, costi di magazzino verificati, oneri fiscali o ROI**. Sono scenari economici per aiutare il proprietario a decidere quanto budget destinare al programma e a stimare l'onere potenziale delle ricompense.

Due KPI:
- **Costo stimato premi consegnati nel mese**, calcolato come somma `numero premi riscattati × costo unitario ipotizzato`.
- **Costo stimato del saldo premi ancora disponibile**, calcolato sul numero di premi maturati e non riscattati delle tessere attive **nello stato attuale**, non come passivo contabile ufficiale.

Se manca il costo di almeno un premio del gruppo, il KPI è marcato **PARCIAL** con quanti premi non sono coperti dalla stima. **Zero euro non significa costo zero** quando mancano le stime.

La modifica delle ipotesi di costo **ricalcola gli scenari anche per mesi passati**. NON riscrive lo storico dei premi, NON genera alcun costo nella tabella `analytics_expenses` e NON modifica l'offerta promessa al cliente. Ogni modifica di stima viene registrata in `loyalty_reward_cost_audit` con utente e valore precedente/nuovo.

## Perché non è ancora un CRM nominativo
- Non leggiamo o importiamo `public.reservations`.
- Nessuna lista WhatsApp/email, nessun invio pubblicitario, nessun tracciamento dei singoli clienti.
- La tessera resta pseudonima: codice e visite potrebbero diventare dati personali in determinati contesti, quindi vanno applicate misure RGPD anche se non salviamo nomi.
- Il CRM nominativo con consenso verificato sarà progettato **solo dopo** la messa in sicurezza delle policy RLS esistenti delle prenotazioni e una base privacy/documentale verificata.
- L'audit generale del sito resta come concordato alla fine dello sviluppo; eventuali problemi confermati che espongono dati reali richiedono correzioni immediate.

## Architettura
Nuova migration: `supabase/migrations/20261108_loyalty_economics.sql`.

Due tabelle:
- `loyalty_reward_cost_assumptions` — chiave (descrizione premio, soglia), costo scenario attuale, data e autore.
- `loyalty_reward_cost_audit` — storico immutabile delle variazioni di costo scenario.

Due RPC `SECURITY DEFINER`, `search_path=''`, verificano **a livello database** `loyalty_staff_authorized()`:
- `loyalty_admin_economics(p_month_start date)` — restituisce soli aggregati e importi di scenario; nessun ID tessera/persona.
- `loyalty_admin_set_reward_cost(p_reward_label text,p_reward_threshold integer,p_estimated_unit_cost numeric)` — imposta/svuota un'ipotesi soltanto per un tipo premio già emesso; usa lock advisory e registra l'audit delle modifiche.

RLS attiva, tabella senza `GRANT` per client `anon` o `authenticated`. Solo le due RPC hanno `EXECUTE` per `authenticated`; l'autorizzazione owner/admin viene nuovamente verificata all'interno delle funzioni. Nessuna nuova Edge Function, webhook, email service o token API.

### Limiti dati
- La cancellazione volontaria di una tessera nella fase 13C/1 elimina anche visite e riscatti associati: lo storico aggregato riflette solo le **tessere ancora esistenti**. Non presentare queste statistiche come bilancio immutabile.
- La distribuzione dei timbri e i premi ancora disponibili sono aggregati **attuali**, anche quando viene selezionato un mese passato.
- Nessuna misura dell'impatto causale del programma sul fatturato, né confronto con gruppo di controllo.
- Le stime di costo cambiano retroattivamente quando si modifica l'ipotesi associata all'offerta.
- Nessuna mappatura dei clienti identificabili; non sappiamo quante tessere diverse appartengono alla stessa persona.

## Deploy
**Prima:** verifica che la PR #30 (hotfix dei delimitatori SQL della Fase 13C/1) sia stata **mergiata in main**. Su GitHub può risultare ancora aperta anche se il file SQL corretto è stato eseguito manualmente in Supabase. Conviene avere la sorgente principale allineata col database prima di continuare.

1. Una volta approvata e mergiata la PR 13C/2, su Supabase del progetto Nonna Angela apri **SQL Editor**.
2. Esegui **UNA VOLTA** il file `supabase/migrations/20261108_loyalty_economics.sql`, senza eseguire nuovamente la migration iniziale delle tessere.
3. Aspetta la build Netlify di `main`, aggiorna il browser e apri **Manager → Analytics → Loyalty Intelligence**.
4. Con nessuna tessera emessa, la schermata deve mostrare tutte le cifre a zero e nessun costo da configurare.
5. Con la tua tessera personale pilota (quando vorrai collaudarla), devono apparire il tipo premio e la soglia; imposta ad esempio un valore **solo dimostrativo** 3,00 € e controlla che lo scenario venga aggiornato. Quando lo verificherai realmente, potrai sostituirlo con il costo diretto effettivo stimato dai dati.
6. Verifica che le metriche mostrate non includano nomi, email o telefoni. La vecchia funzione `/famiglia` e i due bot Telegram restano invariati.
7. Cancella il costo scenario lasciando il campo vuoto e salvando: deve scomparire la stima, senza modificare i premi.
8. Per testare cifre e riscatti veri, **non fabbricare visite in produzione**: usa attività reale o un database di prova separato.

## Stato roadmap
- 13A Customer Intelligence: completata e collaudata.
- 13B Customer Trends: completata e collaudata.
- 13C/1 La Famiglia: codice e migration, collaudo tessera personale rimandato.
- **13C/2 Loyalty Intelligence:** presente PR.
- Prossimo: roadmap di sviluppo restante e hardening accessi prima di ogni CRM nominativo; audit funzionale globale alla fine come richiesto.
