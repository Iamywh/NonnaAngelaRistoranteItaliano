# NONNA ANGELA — FASE 15 · Release acceptance & collaudo end-to-end

**Stato:** IN VERIFICA. L'installazione delle funzionalità e la build CI **non** sono una prova che il backend Supabase, i bot Telegram o i browser dei clienti funzionino sul sito reale.

**Scopo:** validare le Fasi 1–14C prima di passare all'audit finale della Fase 16. Distinguere con evidenze: test automatici, integrazione in ambiente di prova, collaudi di produzione *non distruttivi* e approvazione manuale del ristorante.

## Tre tipi di prova

1. **A. CI / offline:** `npm test`, `npm run test:phase15`, `npm run build`. Le prove automatiche controllano coerenza di codice, formule e contratti statici; **non** accedono a Supabase reale, Telegram o browser. I TODO presenti nei test Phase 15 sono intenzionalmente esclusi dall'affermazione «collaudato».
2. **B. Staging / test database:** tutte le prove che scrivono prenotazioni, contabilità, timbri, riscatti, file o campagne di esempio. Usare un progetto isolato con dati sintetici e gli stessi schema/RLS di produzione, senza condividere credenziali.
3. **C. Produzione, solo read-only / non invasivo:** verifica navigazione, login, visualizzazione dati veri con account autorizzati, query di *soli metadati permessi* `read-only-rls-diagnostics.sql`, bot esistenti con comandi di lettura. Non inviare richieste di prenotazione fittizie, non creare visite/rewards fittizi e non esporre PII.

### Gravità dei problemi
- **P0 — Stop release e gestione immediata:** dati clienti leggibili/modificabili senza adeguata autorizzazione, chiavi server esposte, webhook riservati non autenticati, perdita o cancellazione non autorizzata di dati, conferma prenotazione falsa.
- **P1 — Fix prima della consegna:** prenotazioni legittime bloccate, dati contabili errati, allergeni dichiarati non verificati, upload errato o approvazioni aggirabili, recupero dati non testato.
- **P2 — Miglioramento:** usabilità mobile, lentezza media, contrasto/keyboard secondario, funzionalità non essenziali.
- **P3 — Facoltativo:** nuovi report o integrazioni social non necessari.

## Rischi già individuati analizzando il repository

| Ref | Gravità | Osservazione | Cosa dobbiamo provare |
| --- | --- | --- | --- |
| SEC-01 | **P0 potenziale** | `src/components/Navbar.jsx` controlla `VITE_MANAGER_PASSWORD` nella build browser e `src/App.jsx` usa `sessionStorage.nonna_manager_unlocked`. Questo **non è un confine di sicurezza lato server**, anche se nasconde pagine nel frontend. Analytics ha un ulteriore controllo Supabase owner/admin; altre pagine Manager vanno esaminate separatamente. | Controllare policy/grant RLS e funzioni di modifica per `reservations` e tutti i gestionali. Vietato considerare sicuro il Manager basandosi sulla sola password frontend. |
| SEC-02 | **P0 se esposto** | Il chatbot pubblico legge campi PII da `publicSupabase.from('reservations')`, inclusi telefono, email, nome e note, per supportare la gestione della prenotazione. Il repository **non dimostra** che la RLS di produzione ne impedisca la lettura indiscriminata. | Query read-only sui **metadati delle policy/grant**, poi test di controllo accesso in staging (nessuna lettura di dati clienti veri non autorizzati). Se la policy consente accesso anonimo a PII di terzi, priorità immediata. |
| SEC-03 | **Da verificare** | `reservation-telegram-notify` accetta payload di notifica dal browser. È necessario verificare protezione da spam/notifiche false, rate limits e associazione della notifica a una vera prenotazione, senza interrompere il bot operativo. | Code review e test in staging; mai inviare POST fittizi al bot di produzione. |
| MENU-01 | **P1** | Diversi piatti usano `allergens_to_verify`; la UI mostra allergeni normalizzati ma non può verificare ingredienti e contaminazioni. | Lo chef approva per iscritto una matrice allergeni per **ogni piatto**, inclusi varianti e preparazioni; rendere visibile una spiegazione adeguata sulla contaminazione incrociata. |
| MENU-02 | **Corretto nel codice Phase 15** | Alias italiano `senape` puntava al codice inesistente `senape`; deve puntare a `mostaza` per mostrare il badge «Mostaza». | Test automatico mappa alias → allergeni canonici e verifica menu reale. |
| OPS-01 | **P1** | Le migrazioni sono state applicate manualmente in Supabase. GitHub CI non ne ha verificato l'esecuzione effettiva né lo stato finale dello schema. | Verificare tabelle/RPC/funzioni/privacy storage con schema live e fare backup prima di cambiamenti. |
| OPS-02 | **Da verificare** | I due bot Telegram usano configurazioni e webhook diversi; precedenti interventi erano sensibili a webhook/secret errati. | Verificare comandi e log senza modificare webhook funzionanti. |

**Attenzione:** «P0 potenziale» è un rischio serio ancora da confermare rispetto ai privilegi del DB in produzione, non un'affermazione che i dati siano stati effettivamente esposti. Non eseguire prove con dati personali di altri clienti.

## Matrice di accettazione

Usare stato **PASS / FAIL / BLOCKED / NOT_RUN / N/A**, registrando *data*, *ambiente*, *utente di test*, screenshot con dati personali oscurati e numero issue/PR. Un test è PASS solo se viene eseguito e confrontato con l'aspettativa; «funziona da me» non basta.

### Public website e prenotazioni

| ID | Ambiente | Prova | Atteso | Stato iniziale |
| --- | --- | --- | --- | --- |
| PUB-01 | Produzione read-only | Navigare `/`, `/restaurante`, `/menu`, `/bebidas`, `/famiglia` da desktop | Tutte le pagine si aprono senza errori JS | NOT_RUN |
| PUB-02 | Produzione read-only | Refresh diretto delle cinque rotte e browser Back/Forward | Le rotte restano corrette, senza 404 o redirect errati | NOT_RUN |
| PUB-03 | Produzione read-only | Cambio lingua e ritorno al menu su mobile | Testi, importi e layout rimangono leggibili | NOT_RUN |
| PUB-04 | Staging | Inserire prenotazione dal modulo pubblico per data/ora valida | Un solo record pending, slot adeguato, senza login Manager | NOT_RUN |
| PUB-05 | Staging | Prenotazione dal chatbot; provare date chiuse e slot bloccati | Stesse regole del modulo, niente doppie prenotazioni o slot chiusi | NOT_RUN |
| PUB-06 | Staging | Due prenotazioni contemporanee sullo stesso slot vicino alla capienza | Server impedisce overbooking e rispetta limiti reali | NOT_RUN |
| PUB-07 | Staging | Cambiare/annullare prenotazione da chatbot | Solo la prenotazione autorizzata cambia; non si vedono PII di terzi | NOT_RUN |
| PUB-08 | Staging | Modificare stati da Manager (pending→confirmed→seated→completed/no-show) | Persistenza corretta, niente stati falsi o perdite dati | NOT_RUN |
| PUB-09 | Staging + prod read-only | Controllare disponibilità con e senza sessione Analytics nello stesso browser | Prenotazione pubblica non eredita sessione amministratore | NOT_RUN |
| PUB-10 | Produzione read-only | Controllare avvisi e errori del modulo su telefono reale | Convalida accessibile e comprensibile | NOT_RUN |

### Autorizzazione / RLS (**prima del go-live**)

| ID | Ambiente | Prova | Atteso | Stato iniziale |
| --- | --- | --- | --- | --- |
| SEC-01 | Prod metadata read-only | Eseguire `read-only-rls-diagnostics.sql` | Stato RLS/policy e privilegi visibili senza leggere dati clienti | NOT_RUN |
| SEC-02 | Staging | Anon prova a leggere i campi cliente di una prenotazione non propria | Negato o nessun dato PII di terzi restituito | NOT_RUN |
| SEC-03 | Staging | Anon prova a cambiare/cancellare prenotazione non propria | Nessuna modifica autorizzata; policy server blocca | NOT_RUN |
| SEC-04 | Staging | Utente senza ruolo Analytics prova a leggere/modificare Analytics/Creative | 401/403/permission denied; nessuna PII o mutazione | NOT_RUN |
| SEC-05 | Staging | Testare protezione `reservation-telegram-notify` da payload inventati/ripetuti | Nessun abuso di notifiche, niente token restituiti | NOT_RUN |
| SEC-06 | Staging | Negative test Storage: anon prova a listare, leggere, caricare file privati | Negato; link firmati non condivisi pubblicamente | NOT_RUN |

### Analytics e Telegram

| ID | Ambiente | Prova | Atteso | Stato iniziale |
| --- | --- | --- | --- | --- |
| ANA-01 | Staging | Registrare giornata pranzo+cena, spese, inventario, forecast/targets | Somme, IVA e margini corretti, nessun record duplicato | NOT_RUN |
| ANA-02 | Staging | Import CSV/XLSX con errori e versione corretta | Preview/verifiche, import valido senza record duplicati | NOT_RUN |
| ANA-03 | Staging | Monthly close con conferme, tentativo di modifica dopo close | Chiusura server coerente, protezione e report affidabili | NOT_RUN |
| ANA-04 | Prod read-only | Customer Intelligence 13A vs Trends 13B su 3/6 mesi chiusi | Totali compatibili, mese corrente escluso, no-show non dedotto da `not_arrived` | NOT_RUN |
| BOT-01 | Prod personale autorizzato | Bot prenotazioni `/reservashoy` | Risponde col riepilogo previsto, senza alterare prenotazioni | NOT_RUN |
| BOT-02 | Staging | Analytics `/startentry`, `/cancel`, ripresa e conferma | Nessun doppio salvataggio/replay, input fuori scala rifiutato | NOT_RUN |
| BOT-03 | Staging | Analytics `/startexpense`, importi validi/non validi | Spesa con audit, no double save | NOT_RUN |
| BOT-04 | Staging | Verificare webhook/secret/chat di entrambi i bot | Nessun bot usa webhook o token dell'altro | NOT_RUN |

### La Famiglia, Marketing, Calendario e Creative Library

| ID | Ambiente | Prova | Atteso | Stato iniziale |
| --- | --- | --- | --- | --- |
| LOY-01 | Staging | Programma OFF, crea tessera con emissione ON | Solo staff autenticato può emettere; pubblico vede OFF prima dell'attivazione | NOT_RUN |
| LOY-02 | Staging | Timbro duplice sullo stesso giorno | Solo uno viene registrato, ritorna errore sul duplicato | NOT_RUN |
| LOY-03 | Staging | Riscatto senza saldo, con saldo e doppio riscatto | Controlli saldo, max un riscatto/giorno, registrazione responsabile | NOT_RUN |
| LOY-04 | Staging | Link tessera in incognito, dimentica e cancella definitivamente | Token richiesto; privacy rispettata; delete irreversibile solo dal titolare del token | NOT_RUN |
| LOY-05 | Prod read-only | Loyalty Intelligence, senza creare visite inventate | Costi di scenario marcati come parziali se mancano | NOT_RUN |
| GRW-01 | Staging | Campagna in bozza con budget 0 e metriche assenti | Nessun post/annuncio creato; null ≠ zero | NOT_RUN |
| GRW-02 | Staging | Modifica concorrente della stessa campagna | Versione scaduta rifiutata, audit presente | NOT_RUN |
| EDI-01 | Staging | Bozza → revisione → approvata → modifica copy | Checklist obbligatoria, modifica annulla approvazione | NOT_RUN |
| EDI-02 | Staging | Simulare contenuto già pubblicato (solo staging) | Transizione solo manuale, niente chiamate alle API social | NOT_RUN |
| CRT-01 | Staging | Upload JPG/MP4 in Creative, dimensione/MIME consentiti | Anteprima temporanea, file in bucket privato, metadati corretti | NOT_RUN |
| CRT-02 | Staging | Collegare asset non autorizzato, poi autorizzato | Non verificato bloccato; autorizzato collegabile | NOT_RUN |
| CRT-03 | Staging | Revocare i diritti di asset collegato a contenuto approvato | Contenuto torna bozza, `rights_checked=false`, audit completo | NOT_RUN |

### Menù, esperienza cliente, operazioni, consegna

| ID | Ambiente | Prova | Atteso | Stato iniziale |
| --- | --- | --- | --- | --- |
| MENU-01 | Cucina + produzione read-only | Verifica incrociata dei piatti, varianti, ricette e allergeni con lo chef | Elenco completo approvato e disclaimer corretto | NOT_RUN |
| MENU-02 | Produzione read-only | Confrontare prezzi/nomi sul sito e menù operativo del ristorante | Nessun prezzo/descrizione fuorviante | NOT_RUN |
| UX-01 | Smartphone + desktop | Samsung/Android, iOS Safari, Chrome/Firefox desktop | Navigazione, tastiera, scroll, calendario e form senza blocchi | NOT_RUN |
| UX-02 | Smartphone + desktop | Simulare rete lenta, offline breve, upload non riuscito | Messaggi errori e retry, nessun doppio inserimento | NOT_RUN |
| UX-03 | Accessibilità | Tab/Shift+Tab, screen reader base, etichette, contrasto e zoom 200% | Azioni principali utilizzabili senza mouse | NOT_RUN |
| OPS-01 | Staging | Eseguire restore di un backup database/Storage | Ripristino verificabile; nessun dato cliente perso | NOT_RUN |
| OPS-02 | Produzione read-only | Controllare cookie e informativa privacy; carichi esterni prima del consenso | Solo trattamenti consentiti prima di opt-in ove richiesto | NOT_RUN |
| OPS-03 | Operazioni | Guida gestione ruoli, RLS, bot/webhook, SQL migration, roll-back, turni | Documentazione replicabile da un amministratore autorizzato | NOT_RUN |

## Indicazioni per i test

- **Non iniziare con test di attacco in produzione.** Prima fare diagnosi metadata-only, review policy e staging con dati sintetici.
- Non usare il `service_role` o token bot nel browser / screenshot / issue GitHub / chat; evitare qualunque copia di nomi, numeri o note di prenotazione.
- Per le prove su Telegram con effetti contabili o sui booking, predisporre un bot di staging con webhook separato.
- Per il collaudo di La Famiglia del titolare sul sito reale, usare **solo visite effettive**, non inventare timbri o riscatti.
- La matrice è volutamente `NOT_RUN` all'inizio: documentare l'esito reale prima di cambiarla.

## Registro delle evidenze

| Data (Canary) | Test ID | Ambiente | Risultato | Evidenza priva di PII / issue | Responsabile |
| --- | --- | --- | --- | --- | --- |
| — | — | — | NOT_RUN | — | — |

## Gates prima di dichiarare «PRONTO PER PRODUZIONE»

- [ ] Nessun P0 aperto o non risolto; `SEC-01/02/03/04` soddisfatti con prova verificabile.
- [ ] Percorso prenotazioni completo (form + VA + manager), senza overbooking.
- [ ] Telegram prenotazioni e Analytics restano separati e funzionanti.
- [ ] SQL/RPC effettivamente installati e verificati; backup e restore staging provati.
- [ ] Menu e allergeni approvati dalla cucina.
- [ ] GDPR/cookie e documenti legali esaminati da responsabile adeguato.
- [ ] Test mobile e accessibilità principali superati.
- [ ] CI completa: test, build, regressione e documentazione versionata.
- [ ] Chiusura dei problemi P1 e dichiarazione esplicita dei P2 rimasti.
- [ ] Un responsabile operativo del ristorante approva il rilascio.

## Dopo la Fase 15
- **Fase 16:** correggere e verificare autorizzazioni server, RLS, webhook, Privacy e altre vulnerabilità; gli eventuali P0 confermati vanno trattati **subito**, anche se l'audit finale non è cominciato.
- **Fase 17:** fix UX/performance/accessibilità e rimozione debito tecnico.
- **Fase 18:** documentazione architettura, procedure backup/recovery, regressioni finali e consegna stabile.
