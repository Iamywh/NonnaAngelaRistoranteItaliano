# Nonna Angela — Fase 13C/1 · La Famiglia (pilota)

## Obiettivo commerciale
Creare una relazione continuativa **basata sulle visite verificabili**, non su spese presunte né su una mailing list. Nonna Angela offre una tessera digitale leggera ("La Famiglia") che il personale emette di persona e con cui il cliente segue visite e premi.

**Importante: il programma è disattivato di default.** Non offre nulla fino a quando il proprietario decide un premio sostenibile, lo configura e consente l'emissione. Questa PR fornisce l'infrastruttura di un pilota, non una campagna automatica pronta a inviare messaggi.

## Funzioni implementate
### Cliente · `/famiglia`
- Pagina pubblica che mostra **"Próximamente"** fino all'attivazione manuale del programma.
- Il cliente riceve dal personale un URL privato `https://.../famiglia#card=<token di 64 caratteri>` (la parte dopo # non è inviata nell'HTTP request al server). Nessun nome, telefono, email o account richiesto.
- Aprendo l'URL vede codice corto della tessera, totale visite validate, progresso delle marche, condizioni del premio bloccate al momento di emissione e ricompense disponibili.
- Può copiare il link privato o scegliere esplicitamente di salvarlo in localStorage su **quel dispositivo**. L'eventuale localStorage non è scritto automaticamente.
- Può dimenticare la tessera solo sul dispositivo senza cancellarla sul server; può anche eliminare **definitivamente** tessera, visite e premi con conferma, tramite il token segreto.
- Chiunque abbia il link può leggere o eliminare la tessera: è una credenziale **bearer**. Il cliente deve custodirlo; il segreto non può essere ricostruito da noi.

### Gestione · Manager → Analytics → La Famiglia
Accessibile esclusivamente dopo l'autenticazione Supabase Analytics e con ruolo `owner`/`admin` verificato **nel database**. La vecchia password del Manager UI da sola **non** abilita le RPC.
- Configurazione dell'offerta: nuovo premio (descrizione 5–100 caratteri) e numero di visite per premio (3–12), toggle per **emettere nuove tessere**; default `OFF`.
- Configurazioni nuove applicate solo alle **tessere emesse dopo** il cambiamento. Una tessera già consegnata mantiene soglia e premio originari.
- Emissione manuale di tessera. La funzione genera un token segreto random 256-bit e lo restituisce **una sola volta** al personale. In DB resta solo SHA-256 del token. Il codice breve da 8 caratteri serve solo al personale per trovare la tessera; da solo **non** dà accesso al wallet pubblico.
- Visita registrata dal personale dopo verifica reale: **massimo una per data**, la data deve essere oggi o uno dei 7 giorni precedenti. La funzione identifica e registra l'utente Analytics che autorizza.
- Riscatto manuale del premio dopo consegna fisica; l'utente deve confermare. Non si possono riscattare più premi delle soglie maturate e solo uno nello stesso giorno. La funzione registra chi lo ha riscattato.
- KPI pilota: tessere emesse, tessere attive, visite validate negli ultimi 30 giorni, premi consegnati negli ultimi 30 giorni.
- **Nessun** auto-accredito da prenotazioni e nessun import automatico del fatturato.

## Regole consigliate per un pilota
*Proposta commerciale, non impostata come premio live:* 5 visite con consumazione comprovata → un dolce della casa. Calcola prima il costo ingredienti, la disponibilità e i margini; il nome del premio è un campo configurabile. Se il premio costa 3 € e ogni visita genera in media 40 € di vendite, il **costo diretto teorico del premio** sarebbe 3/(5×40)=1,5% delle vendite associate a quelle visite; non equivale a profitto incrementale né a spesa di marketing completa. Sono dati **puramente illustrativi**, non misure reali di Nonna Angela.

Il personale deve verificare che una visita corrisponda a consumo reale e un solo timbro giornaliero. Non c'è integrazione con il TPV e non c'è modo automatico di distinguere clienti che sarebbero ritornati comunque. Valuta un pilota in sala con numeri modesti e controllo del costo totale premi.

## Privacy e sicurezza
- I dati sono indipendenti dalla tabella `public.reservations`: **non** vengono lette le vecchie policy anon di prenotazione, né nomi, numeri telefonici, email, note, IP, ricevute o riferimenti a prenotazioni.
- Quattro tabelle nuove: `loyalty_program_settings`, `loyalty_cards`, `loyalty_visits`, `loyalty_redemptions`. RLS abilitata e **nessuna** SELECT/INSERT/UPDATE/DELETE diretta per `anon` o `authenticated`; solo RPC dedicate Security Definer.
- Le RPC staff controllano `auth.role()='authenticated'` e un ruolo Analytics `owner/admin` `is_active` sul server.
- Le uniche RPC anon sono: stato generale del programma, vista della propria tessera con segreto, eliminazione della propria tessera con segreto. Il token ha 256 bit di rappresentazione generata da due UUIDv4; SHA256 viene conservato, non il token.
- Le visite e i riscatti sono log che includono l'identità dell'utente **staff**, non del cliente; cancellare la tessera elimina anche le sue visite e riscatti.
- Un codice di tessera pseudonimo **può comunque essere dato personale** in certi contesti; non presentiamo questa soluzione come "esente RGPD". Prima del lancio va completata la corretta informativa privacy (titolare effettivo, contatti e diritti, base giuridica, tempi di conservazione, destinatari) e chiarita con consulente legale la forma del programma.
- Nessun consenso per marketing viene raccolto e nessuna comunicazione commerciale viene inviata. **Mai usare i dati di prenotazioni per popolare una lista promozionale.** L'eventuale Fase 13C/2 CRM con email/WhatsApp necessita progettazione separata di opt-in, verifica, revoca, conservazione e sicurezza.

### Limiti del pilota
- Chi condivide volontariamente il link può far vedere/cancellare il proprio saldo a terzi. Non è un pass associato a una identità reale.
- Chi perde il link e non l'ha salvato **non può recuperare** la tessera mostrando solo il proprio nome o telefono, perché questi dati non sono salvati.
- L'invio della tessera tramite WhatsApp, se deciso dal personale, è un'azione umana; nessuna automazione di messaggistica viene attivata.
- Nessuna protezione automatica su numero di tessere per cliente; l'emissione è solo staff e ogni timbro richiede verifica in sala. La qualità delle visite dipende dal personale.
- Non sono previsti SMS, push, email, codici QR generati automaticamente, termini con scadenza, classifiche nominative o campagne.
- Prima di promuovere il programma pubblicamente, decidere le condizioni commerciali e l'informativa privacy appropriata. Non fissare retroattivamente le condizioni su tessere già distribuite.

## Installazione dopo test e merge
1. Aprire la PR 13C/1, attendere CI e build Netlify verdi, fare `Ready for review → Merge pull request`.
2. Nel progetto Supabase **Nonna Angela**, SQL Editor → incollare ed eseguire **una volta** il file `supabase/migrations/20261107_loyalty_cards_pilot.sql`. Dipende dalla tabella Analytics esistente `analytics_user_roles`; non modifica le tabelle già presenti.
3. Lasciare che Netlify distribuisca la pagina pubblica `/famiglia` e la tab **Manager → Analytics → La Famiglia**. Nessuna Edge Function o webhook da aggiornare, nessun secret aggiuntivo.
4. Accedere a `/famiglia` SENZA tessera: deve mostrare `Próximamente` finché le nuove emissioni restano OFF.
5. Aprire Analytics → La Famiglia. Controllare che sia OFF, inserire una descrizione **pilota** e soglia, abilitare solo dopo aver deciso il premio e la comunicazione legale ai clienti.
6. Creare UNA tessera di prova: copiare e custodire il link segreto, aprirlo su altro dispositivo in incognito e verificare che mostri zero visite. Inserire il codice corto in Analytics, selezionare oggi e confermare una visita **SOLO come test interno**. La carta deve mostrare 1 marca.
7. Ripetere la stessa data: deve comparire errore "Visit already recorded". Una persona anonima **non** può chiamare le RPC di emissione/timbro/riscatto.
8. Per testare riscatto senza simulare visitatori falsi in produzione, usare **ambiente Supabase di staging** e validare i 3/5 timbri su giorni distinti. Se non c'è staging, non fabbricare visite reali: rimandare il test del riscatto a un ciclo di visite reali.
9. Eliminare la tessera di prova dal wallet e verificare che non sia più accessibile. Le azioni eliminazione sono irreversibili.
10. Confermare che prenotazioni pubbliche, bot Telegram e Analytics 13A/13B restino invariati.

**Non eseguire la migrazione se non si è sul progetto corretto.** Effettuare backup o verificare il piano di rollback prima di fare prove con clienti reali.

## Fasi successive
- **13C/2 (facoltativa):** marketing consensuale/CRM nominativo con opt-in verificato e revoca; solo dopo hardening RLS prenotazioni e informativa adeguata.
- **Audit globale del sito** rimane alla fine della roadmap dello sviluppo come richiesto, ma difetti critici di sicurezza noti vanno contenuti subito se confermati.
