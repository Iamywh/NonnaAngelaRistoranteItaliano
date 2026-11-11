# Costi Excel, inventario ingredienti e ordini condivisi

Questa versione importa le 31 schede del 10 novembre 2026, con provenienza, note e affidabilità, e le confronta con la carta pubblicata. Non cambia prezzi o ricette pubbliche. Tre piatti della carta senza scheda hanno un costo da compilare; tre schede Excel fuori carta restano consultabili. Cinque abbinamenti con differenze di ricetta richiedono una conferma esplicita prima di usare il costo.

## Attivazione

1. Applicare in Supabase SQL Editor, nell'ordine:
   - `supabase/migrations/20261110170000_manager_costs_procurement.sql`
   - `supabase/migrations/20261110171000_manager_workbook_seed.sql`
2. Distribuire la Edge Function `orders-telegram-notify` con il relativo `handler.mjs`. La voce in `supabase/config.toml` disabilita il controllo JWT del gateway; il codice verifica comunque il token con Auth e il permesso ordini prima di leggere un ordine.
3. Configurare `ORDERS_TELEGRAM_CHAT_ID` con l'ID del gruppo ordini e `ORDERS_TELEGRAM_BOT_TOKEN` con il token del bot dedicato. Il bot deve essere membro del gruppo. Lasciare il secret `TELEGRAM_BOT_TOKEN` alle integrazioni che lo usano già. Salvare il token solo nei secrets Supabase.
4. Distribuire il frontend tramite il normale flusso GitHub/Netlify.
5. Accedere con un account admin e controllare Food cost e Ordini. Solo una richiesta operativa reale deve provare il recapito a Manu: nessun messaggio di test è stato inviato durante lo sviluppo.

Il salvataggio ordine funziona anche senza configurazione Telegram; lo storico mostrerà “Da inviare”. La funzione può essere configurata e distribuita successivamente, quindi il pulsante di invio permette di notificare gli ordini ancora in attesa.

## Uso e accessi

- Owner/admin: costi e ipotesi mensili, conferma ricette, assegnazione fornitori e costi unitari.
- Account con modulo `orders`: conteggio ingredienti, scorte minime, creazione ordini e storico condiviso. Non ottiene accesso a Backoffice o costi fissi. Nessuna modifica alle assegnazioni di ruolo esistenti.
- Gli account con il solo permesso `beverage_inventory` mantengono l'inventario bevande esistente; il nuovo inventario ingredienti richiede `orders`.
- Inventario ingredienti: salvare ogni riga con “Salva inventario”. Vuoto significa non contato; zero è un conteggio effettivo. Le versioni impediscono di sovrascrivere un conteggio aggiornato da un collega. Ricaricare dopo un conflitto, verificando prima le modifiche locali.
- L'inventario bevande esistente resta l'unico conteggio bar/cantina. Nel catalogo fornitori admin si possono modificare i fornitori e i costi anche dei prodotti bar, senza creare un secondo conteggio bevande.
- Gli ordini sono richieste interne, non invii ai fornitori. Non aumentano automaticamente le giacenze né generano spese contabili. Registrare la merce consegnata e le fatture quando effettive.
- Le bozze ordini sono conservate per account sul dispositivo. Uno stesso identificativo mantiene il salvataggio idempotente anche se la risposta si perde. L'archivio locale precedente resta esportabile, senza invii retroattivi.
- Lo storico web mostra gli ultimi 100 ordini con filtri per fornitore e mese; il database conserva anche quelli precedenti.

## Costi e qualità dei dati

Il budget mensile iniziale è **20.000 €**, indicato dall'utente. Il dettaglio originale Excel totalizza **16.700 €**: personale 11.700, luce 2.000, acqua 1.000, affitto 2.000. I 3.300 € di differenza non sono stati attribuiti a categorie inventate. Il budget è modificabile e non registra automaticamente spese in Analytics.

Coperti, ticket, piatti per coperto, quota cucina, target materie prime e aliquota vendite sono ipotesi, inizialmente quelle dell'Excel. L'IGIC del 7% è una simulazione uniforme, non una riconciliazione fiscale. I fissi sono un budget convenzionale senza detrazione fiscale automatica. Il pareggio considera il target materie prime sull'intero incasso netto: verificare mix bevande e altri costi variabili.

Il contributo per piatto usa il prezzo attuale netto dell'IGIC ipotizzato meno materie prime. La quota fissi ripartita è mostrata separatamente e non viene sommata una seconda volta ai fissi mensili. Non chiamare il residuo simulato “utile netto”. Analytics mantiene consuntivi, spese effettive, inventario mensile a valore e piano di pareggio per mese.

I due Excel non contengono una distinta ingredienti-fornitori. I 123 prodotti provengono dal catalogo esistente. I costi unitari sono importati solo per corrispondenza esatta di ID, unità e fornitore; non vengono usati alias provvisori o prezzi retail del foglio fonti come fornitori reali. I prodotti con fornitore assente/non riconosciuto non sono ordinabili finché un admin non li completa. Un costo piatto non viene ricostruito automaticamente da quantità d'ingredienti non disponibili nei file.

La tabella costi e il catalogo sono privati, accessibili tramite RPC autorizzate. I dati salariali non sono inclusi nel bundle pubblico. Le righe ordine sono fotografie server dei prodotti e dei fornitori al momento della richiesta. Le quantità e i fornitori ricevuti dal browser non possono falsificare nomi o unità.

## Stati Telegram e recupero

`pending` → `sending` → `sent`, `failed` o `uncertain`. La presa in carico atomica impedisce invii contemporanei. Un rifiuto esplicito di Telegram consente di riprovare. Timeout/disconnessioni possono avvenire dopo il recapito: in quel caso non si invia automaticamente una seconda volta. Se la funzione si interrompe dopo la presa in carico lo stato può restare `sending`.

Per `sending`/`uncertain`, verificare prima la chat e l'ordine. Solo dopo una verifica umana, un amministratore del database può correggere lo stato del singolo ID (mai un reset globale):

```sql
-- Se il messaggio è effettivamente presente:
UPDATE public.procurement_orders
SET notification = 'sent', notified_at = now()
WHERE id = 'UUID_ORDINE' AND notification IN ('sending', 'uncertain');

-- In alternativa, solo se accertato che non è arrivato e la funzione è terminata:
UPDATE public.procurement_orders
SET notification = 'failed'
WHERE id = 'UUID_ORDINE' AND notification IN ('sending', 'uncertain');
```

Dopo il secondo caso, ricaricare e premere “Invia / riprova Telegram”. Non cambiare lo stato di un ordine mentre la funzione lo sta elaborando.

## Verifica tecnica

`npm ci`, `npm test`, `npm run build` con variabili Vite configurate. I test comprendono formule, autorizzazioni reali Postgres tramite PGlite, versioni concorrenti, validazione quantità, idempotenza ordini, privilegi diretti negati e presa in carico notifiche. I test del servizio Telegram usano dipendenze simulate; non inviano messaggi reali.

L'importatore riproducibile è `scripts/costing/import_workbooks.py RAW.xlsx FULL.xlsx` (Python + openpyxl). Produce il seed SQL iniziale, senza scrivere negli Excel. Il seed usa `ON CONFLICT DO NOTHING`: rieseguirlo non sovrascrive revisioni manuali; un nuovo caricamento massivo richiede una migrazione di aggiornamento esplicita. L'aggiornamento ordinario di costi e ipotesi avviene dalla pagina admin.
