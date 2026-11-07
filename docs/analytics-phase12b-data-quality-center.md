# Nonna Angela — Phase 12B/3: Data Quality Center e checklist pre-chiusura

## Funzione
Nuova scheda privata **Manager → Analytics → Calidad de datos**.

La pagina è **solo lettura**: usa le stesse tabelle già disponibili su Supabase per identificare anomalie con regole esplicite, e chiama la RPC ufficiale `analytics_evaluate_month_close` per lo stato di conciliabilità del mese.

**Nessuna nuova migrazione SQL**, nessuna Edge Function nuova, nessuna modifica a Telegram, secrets, webhook o prenotazioni.

## Requisiti dati
- Accesso con sessione Supabase `authenticated` e ruolo Analytics owner/admin già verificato dalla pagina contenitore.
- Legge `analytics_daily_entries` con `analytics_service_entries`, `analytics_expenses`, `analytics_monthly_inventory`, `analytics_monthly_history`, `analytics_monthly_closures`.
- Interroga `analytics_evaluate_month_close(p_month_start,p_revenue_source)`; la RPC già esistente conserva l'autorità esclusiva sull'effettiva idoneità al cierre mensual.
- Se una query fallisce, se l'RPC non risponde o se ci sono troppe righe per garantire completezza dei dati, la schermata non mostra un falso stato «tutto bene».
- Per i mesi chiusi usa **automaticamente la fonte di ricavo fissata dal cierre**, senza modificare la fotografia contabile.

## Diagnostica
- Giornate senza registrazione **fino a ieri** nel mese corrente, tutte nel mese passato. Le date future e oggi stesso non vengono falsamente considerate mancanti. Per un giorno chiuso va comunque registrata la chiusura quando il ricavo proviene dai dati giornalieri; un giorno assente **non** è interpretato come vendite 0.
- Giorni in `draft`, servizi mancanti, incoerenza «closed ma con comensali/ventas», entrate senza coperti o coperti senza entrate.
- Vendite con base `gross`, status `tax_details=unverified` con vendite non zero (solo avviso: non si assume che l'IGIC sia sbagliata, non si stima l'aliquota).
- Spese non registrate, categoria presente nello stesso mese con totali `daily` e `monthly`, basi fiscali `gross`, importi anomali.
- Inventario alimenti o bevande assente / non completamente conciliato.
- Storico mensile e giornate per lo stesso mese: **non sommare mai i due valori**.
- Dopo un mese già chiuso, confronto tra impronta digitale attuale e fingerprint del cierre. Qualsiasi differenza richiede revisione; non si riscrive il cierre.

## Distinzione importante: «Calidad de datos» vs «Cierre mensual»
Il Centro fornisce dettagli più granulari e collegamenti alle schede con i registri.
La pagina **Cierre mensual** continua a usare la RPC Supabase, i cinque consensi obbligatori e la nota documentale per il cierre; l'analisi locale non può sbloccarlo o finalizzarlo.

La checklist del Data Quality Center include: caja e ventas, gastos, inventario, IGIC, consapevolezza dello scope gestionale. È **solo una guida nella sessione corrente** e si azzera al cambio mese, fonte o refresh. Non si scrivono atti di conferma sul server. È necessario compilare nuovamente le vere conferme del modulo Cierre mensual.

## Test dopo merge
1. Fare merge della PR dopo CI verde e deploy Netlify; **nessun SQL** da eseguire, nessuna Edge Function da ripubblicare.
2. Aprire Manager → Analytics → **Calidad de datos**.
3. Selezionare mese corrente: la lista dei giorni mancanti non deve includere il giorno corrente né date future.
4. Selezionare un mese precedente con dati mancanti: la tabella indica i giorni assenti; non li riempie automaticamente con zeri.
5. Usare un mese con borradores, spese gross o inventario incompleto: controllare gli avvisi e i collegamenti ai rispettivi moduli.
6. Selezionare **histórico** come fonte e verificare che mancanza di giornate non impedisca automaticamente il cierre quando il server lo considera pronto; la validità dei dati netti e delle spese resta verificata dal server.
7. Spuntare la checklist: non deve creare nuove righe o modificare cifre. Cambiare mese: la checklist torna vuota.
8. Aprire Cierre mensual: le cinque conferme reali e la nota restano obbligatorie. Non chiudere un mese con dati di test.
9. Verificare che la connessione Analytics /startentry e /startexpense non sia stata modificata.

## Stato roadmap
**Fase 12B/1** — Telegram /startexpense: sviluppato, implementato su Supabase; test completo di salvataggio con importi reali ancora da verificare se non già effettuato.

**Fase 12B/2** — import CSV/XLSX di registri nuovi: completato e collaudato dall'utente.

**Fase 12B/3** — Data Quality Center e checklist pre-chiusura: questa PR.

**Successivo: Fase 13 — Customer Intelligence** (prenotazioni, coperti dichiarati, presenze e indicatori commerciali). L'audit finale dell'intero sito resta successivo allo sviluppo completo, come da richiesta del progetto.

## Ambito e limiti
Le regole qui implementate non verificano documenti di acquisto, fatture fisiche, dichiarazioni fiscali, prezzi di mercato o presenza reale dei clienti. Alcune incoerenze sono semplici possibilità da esaminare, non errori contabili provati. Non viene introdotto alcun motore AI, scraping, monitoraggio automatico o alterazione di dati di produzione.
