# Nonna Angela — Fase 13B: trend di prenotazione e opportunità commerciali

## Cosa aggiunge
Nuova scheda privata **Manager → Analytics → Tendencias clientes**.

Permette di confrontare **3 oppure 6 mesi calendario interamente conclusi**, scegliendo il mese finale. Recupera solo aggregati dal server tramite la **RPC della 13A**:
`analytics_customer_intelligence(p_month_start)`.

Non sono necessarie nuove tabelle, migrazioni, Edge Functions, secrets, webhook o modifiche al bot Telegram.

## Funzioni
- Andamento delle **richieste** mensili: valore assoluto, richieste medie per **giorno di calendario** e variazione dell'ultimo mese completo rispetto al precedente.
- Serie mensile per `pending`, `confirmed`, `cancelled`, `rejected`, posti richiesti delle richieste attive, prenotazioni segnate come arrivate/no-show e date passate ancora senza esito.
- Quota delle richieste con stato di servizio classificato (`seated/completed/no_show` su richieste attive) per non scambiare stati `not_arrived` per no-show automatici.
- Aggregati per pranzo/cena/fuori turno, giorno della settimana e anticipo prenotazione, leggibili anche senza grafici interattivi. Per confrontare i giorni della settimana, i suggerimenti normalizzano per **quante volte cade quel giorno nei mesi analizzati**; non assume comunque che il ristorante fosse aperto.
- Regole commerciali leggibili per: calo significativo di richieste per giorno calendario, domanda comparativamente più bassa per turno e giorno, presenza di molte richieste last-minute, cancelazioni e classificazione incompleta del servizio.
- Collegamenti al modulo Customer Intelligence e al gestore delle prenotazioni.
- Nessun cambiamento o creazione di prenotazioni.

## Attenzione alle metriche
- Il confronto **esclude il mese corrente**: non si confrontano 7 giorni con un mese terminato.
- Una richiesta `confirmed` non equivale a cliente arrivato; `not_arrived` non equivale a no-show.
- Le **plazas solicitadas activas** sono coperti richiesti dalle prenotazioni `pending/confirmed`, **non** occupazione misurata o coperti del TPV.
- Il tasso `no_show/(arrived+no_show)` descrive **solo i casi segnati dal personale**; non l'incidenza sui clienti totali quando mancano stati.
- I dati vengono letti secondo lo **stato attuale del database**, non come fotografia storica del momento di prenotazione. Se il manager modifica uno stato, anche i riepiloghi di mesi passati cambiano.
- I giorni e i turni apparentemente deboli possono essere giorni di chiusura o turni non offerti. **Non lanciare promozioni senza controllare calendario, capacità e costi**.
- La differenza percentuale mensile delle richieste viene normalizzata per il numero di giorni calendario del mese, non per i giorni effettivamente aperti; servirebbe una futura tabella affidabile del calendario operativo per questa correzione.
- Per le raccomandazioni di marketing vengono usate **soglie orientative esplicite**; una correlazione o un calo rilevato non dimostra il motivo.
- Origine `website` non distingue modulo e chatbot: entrambi usano `source=website`. Nessuna attribuzione agli annunci Google/Instagram è verificata.
- **Non** si calcola fatturato per prenotazione, conversione del sito, fidelizzazione nominativa o redditività di una campagna senza eventi e vendite realmente attribuibili.

## Sicurezza
- La pagina fa fino a 6 richieste parallele alla **RPC privata già installata della Fase 13A**, senza accedere direttamente a `public.reservations`.
- Ogni chiamata RPC richiede la sessione `authenticated` e `analytics.read`, come nella fase precedente.
- Risultati JSON solo aggregati, non PII (nessun nome, telefono, email, note o ID cliente).
- Se manca un mese o una RPC fallisce, l'intero confronto viene invalidato: non vengono mostrate serie parziali come se fossero complete.
- La pagina valida congruenza tra totali mensili e aggregazioni per servizio, giorno, canale, anticipo e origine.
- Nessuna scrittura in database. Nessuna apertura di privilegi o modifica alle RLS preesistenti.

## Deploy
1. Aprire la PR 13B, verificare CI e build Netlify verdi, fare **Ready for review → Merge pull request**.
2. Attendere che Netlify pubblichi il sito aggiornato e aggiornare con `Ctrl + Shift + R`.
3. Entrare in **Manager → Analytics → Tendencias clientes**.
4. Non eseguire SQL, non aggiornare Edge Functions, non modificare i due webhook o i secrets.

## Collaudo manuale
1. Selezionare `3 meses completos` terminando a ottobre 2026 e confrontare con la scheda 13A dei mesi agosto, settembre, ottobre. I numeri devono corrispondere; i mesi privi di prenotazioni valgono zero richieste, non richiedono righe inventate.
2. Passare a `6 meses completos`. La tabella deve mostrare 6 mesi consecutivi, e i totali devono corrispondere alla somma.
3. Il selettore non deve permettere novembre 2026 mentre novembre è ancora in corso.
4. Con due mesi di 30 e 31 giorni con 30 e 31 richieste, la media giornaliera è uguale: il segnale di variazione normalizzata sarebbe 0%, non +3,3%.
5. Se una prenotazione passata è ancora `not_arrived`, il pannello segnala «Sin clasificar» e non la conta automaticamente come no-show.
6. Per mesi con poche richieste verificare «Muestra limitada» anziché inventare opportunità.
7. Se una RPC produce un errore, il pannello non deve mostrare dati parziali e nessun record deve essere modificato.
8. Verificare che 13A Customer Intelligence, 12B Data Quality Center, prenotazioni pubbliche e bot Telegram continuino a funzionare normalmente.

## Roadmap
- **Fase 13A:** dashboard dati mensili aggregati, completata e collaudata.
- **Fase 13B:** questo modulo, confronto 3/6 mesi e segnali commerciali.
- **Possibile 13C:** loyalty / CRM e retention, ma solo dopo definizione del consenso e revisione accessi alle prenotazioni. Le vulnerabilità di accesso a dati personali già note vanno contenute quando confermate, indipendentemente dalla data prevista per l'audit generale.
- **Audit globale del sito:** dopo lo sviluppo funzionale, come concordato.

## Test disponibili
`tests/analyticsCustomerTrends.test.mjs`, inclusi nel controllo PR di GitHub. I test del codice non sostituiscono un collaudo nel browser con i dati reali e le autorizzazioni di produzione.
