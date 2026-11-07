# Nonna Angela — Fase 12B/2: Importazione CSV / Excel

## Risultato
Nuova scheda **Manager → Analytics → Importar CSV/Excel** per caricare in blocco
- **Giornate complete**: una riga per data con dati dichiarati per pranzo e cena. Sempre salvate come `draft`, mai `finalized`; entrambe le righe servizio sono create insieme. IGIC non viene inferita.
- **Totali spese**: una riga per categoria e periodo (daily oppure monthly). Non sono fatture singole; se più fatture appartengono alla stessa categoria+periodo bisogna fornire il totale verificato, non duplicati.

Lo **storico mensile** (import CSV con data_quality, provenienza ecc.) continua a essere gestito dalla scheda `Histórico`, senza sommare automaticamente quelle cifre alle giornate.

## Flusso utente
1. Accedi con un utente Analytics autorizzato (owner/admin), vai alla scheda `Importar CSV/Excel`.
2. Scegli *Días y servicios* oppure *Gastos por categoría*.
3. Scarica il modello CSV. Aprilo e compila in Excel/LibreOffice, lasciando esattamente le intestazioni, in ordine. Puoi caricare il CSV o salvarlo in Excel `.xlsx` e caricare quello.
4. Carica fino a **60 righe**, file al massimo 2 MB. Il browser legge il file localmente, senza inviarlo ad alcun provider esterno.
5. La validazione locale rifiuta date impossibili, importi non validi, categorie sbagliate e chiavi duplicate nello stesso file.
6. Premi **Validar en Supabase (sin guardar)**. Il database autorizza l'utente, controlla le righe, confronta le chiavi con quelle esistenti e identifica i mesi già chiusi; nessun salvataggio.
7. **Importar lote completo** appare attivo solo se tutti i record sono nuovi e confermi la dichiarazione. Alla conferma, il server revalida **tutto** in una transazione. Se anche una riga presenta conflitto, l'importazione viene annullata interamente.
8. Controlla i dati importati da `Registro diario` o `Gastos`. Nessun registro è finalizzato automaticamente.

### Template 1: Giornate
```csv
business_date;lunch_status;lunch_covers;lunch_food;lunch_beverage;lunch_tax_basis;dinner_status;dinner_covers;dinner_food;dinner_beverage;dinner_tax_basis;notes
```
- Data in formato testo `AAAA-MM-DD`, non data numerica seriale Excel.
- Per `status` usare `open` oppure `closed`; per `tax_basis` `gross` o `net`.
- Per ciascun servizio dichiarato `closed`, usare **0** per coperti, vendite cibo e bevande.
- Indicare gli importi come decimali non negativi (punto o virgola; massimo due decimali), senza separatori delle migliaia.
- Ogni data deve essere nuova. Anche una giornata in `draft` già presente **non può essere sovrascritta dall'import**.

### Template 2: Spese
```csv
period_kind;period_date;category;amount;tax_basis;igic_amount;notes
```
- `period_kind`: `daily` oppure `monthly`.
- `period_date`: `AAAA-MM-DD`, e per `monthly` deve essere il primo giorno del mese (`AAAA-MM-01`).
- `category`: `food_purchases`, `beverage_purchases`, `payroll`, `rent`, `utilities`, `marketing`, `cleaning_supplies`, `packaging`, `maintenance`, `professional_services`, `bank_fees`, `other`.
- `amount` strettamente maggiore di 0. `tax_basis`: `gross` o `net`. `igic_amount` è facoltativo; lasciarlo vuoto quando non verificato. Non si effettua nessuna conversione fiscale.
- Una riga categoria/periodo già esistente non è modificata o sommata. Per correggere i totali già esistenti usare la schermata `Gastos` con audit.

## Installazione dopo merge PR
**NON bastano merge GitHub e deploy Netlify.** Il nuovo backend SQL va installato prima di usare la nuova scheda:

1. Nel progetto Supabase Nonna Angela apri **SQL Editor**.
2. Incolla e avvia una volta `supabase/migrations/20261107_analytics_import_register_batch.sql`. Il file crea `analytics_import_batches`, `analytics_import_rows` e la RPC `analytics_import_register_batch`. Non modifica prenotazioni, bot Telegram, secrets, né altre Edge Functions.
3. Verifica che Netlify abbia pubblicato la nuova versione del sito.
4. Accedi come owner/admin e apri `Analytics → Importar CSV/Excel`. Scarica un template e prova a caricare **solo una riga di prova per una data già registrata**: la vista previa deve segnalarla come `Ya existe`, senza permettere l'importazione.
5. Prova con file errato (status, data, intestazione, duplicati); deve apparire un errore senza nessuna scrittura.
6. Per il primo import vero, usa solo dati storici verificati che **non esistono già**. Controlla il numero di righe, poi conferma. Verifica lo stato `draft` per giornate e la base fiscale per le spese.
7. Se una data viene occupata tra anteprima e conferma, il server rifiuterà l'intero lotto, non importerà parzialmente. Verifica i dati prima di riprovare.

## Limitazioni consapevoli
- Solo la prima scheda del file `.xlsx` viene letta, senza formule, macro o links esterni; valori soltanto. Se le date Excel risultano numeri seriali, converti la colonna in testo ISO prima del caricamento. File `.xls` vecchio non supportato; esporta in CSV.
- La lettura XLSX utilizza le API browser moderne `DecompressionStream('deflate-raw')`; in browser meno recenti usare CSV.
- Non corregge né armonizza importi netti/lordi o aliquote IGIC; nessun calcolo dedotto da prenotazioni.
- Quantità massima 60 righe per batch. Per grandi storici usa batch piccoli e ricontrolla ogni importazione.
- Il server richiede `authenticated` + permesso `analytics.write` e non concede scritture tabella dirette; traccia lotto e ogni riga in un audit dedicato.
- Nessun file fisico viene salvato su Supabase; vengono trasmessi soltanto i dati normalizzati e confermati.
- **Fase 12B/3** prevista: Data Quality Center e checklist prima del close mensile.
- L'audit globale del sito rimane pianificato dopo l'implementazione dell'intero ecosistema.
