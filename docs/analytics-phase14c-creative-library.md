# Nonna Angela — Fase 14C · Creative Library privata

## Obiettivo

Creare un archivio pratico per foto e video di piatti, vini, cocktail, locale, team ed eventi, **collegato al Calendario Editoriale 14B**. Il materiale rimane **privato** finché non viene utilizzato manualmente su una piattaforma social esterna, con controllo dei diritti e approvazione nel calendario.

**Questa fase include davvero il caricamento** di file tramite il browser su Supabase Storage. Non si limita a memorizzare nomi di documenti o mockup e non crea link pubblici permanenti.

## Funzioni consegnate

### Analytics → Creative Library

- Upload singolo di **JPG, PNG, WebP, MP4 e WebM**, massimo **25 MiB per file**. HEIC e MOV non sono supportati in questa prima versione: convertirli prima di caricare. Video lunghi vanno compressi.
- Bucket Storage dedicato `nonna-creative-library`, **public=false**, limitazioni server su dimensione e MIME. Percorsi casuali `media/<uuid>.<estensione>`; nessun nome cliente/file personale incorporato nel percorso Storage.
- Registro metadati: titolo, categoria (platos/vinos/cocktails/local/eventos/equipo/otros), tag (massimo 8), credito autore, note operative, nota diritti d'uso, stato `active`/`archived`.
- **Stato diritti:** `unverified` (iniziale), `cleared` (uso verificato dal personale con giustificazione scritta), `restricted` (non utilizzare). L'etichetta non sostituisce licenza, consenso né consulto legale.
- Galleria privata con ricerca per titoli, tag, note, categoria, anteprime foto/video e paginazione da 12 risorse. Max 300 risorse restituite dalla RPC nella prima versione; serve paginazione server prima di superare questa scala.
- Le anteprime sono URL **firmati temporanei da 10 minuti** generati da un amministratore autenticato: **non** usare quegli URL in Instagram, sito pubblico o comunicazioni promozionali.
- Modifica dei metadati con controllo `revision`: se un altro manager cambia un file, il tuo salvataggio viene rifiutato finché non aggiorni. Ogni cambio genera audit con identità dello staff.
- Non si cancellano automaticamente media registrati o i relativi diritti/audit: **Archivar** li rimuove dalla normale galleria, ma mantiene la copia nel bucket. Per necessità di cancellazione permanente e privacy usare procedura controllata, valutando i riferimenti e gli obblighi di conservazione.

### Collegamento ai contenuti

- Si seleziona un mese editoriale e si associa una risorsa a un elemento 14B dello stesso mese, tramite il pannello della libreria.
- Solo una risorsa **attiva + diritti cleared** può essere collegata. Il server impone max **8 risorse per contenuto** e impedisce di modificare i collegamenti di voci `published`/`cancelled`.
- In Calendario Editorial appare il numero e il titolo dei media collegati, con avviso se l'asset viene successivamente archiviato o i diritti d'uso diventano non validi. Per tornare alla libreria è presente un pulsante diretto.
- **Sicurezza delle approvazioni:** link, unlink, archivio o revoca dei diritti di un asset già collegato a un contenuto `in_review` o `approved` riporta quel contenuto a `draft`, annulla l'approvazione precedente e imposta nuovamente `rights_checked=false`. Il responsabile deve quindi riesaminare e confermare i diritti prima di sottoporre il contenuto a nuova revisione.
- **Già pubblicato:** i contenuti `published` sono immutabili. Se il diritto d'uso viene revocato dopo la pubblicazione, la scheda calendario indica l'anomalia e serve intervento umano sulla piattaforma social. Non è prevista cancellazione automatica da Instagram o Google.

## Sicurezza

Migrazione: `supabase/migrations/20261108_analytics_creative_library.sql`.

Prerequisiti: le migrazioni Analytics owner/admin, **14A Growth Planner** e **14B Editorial Calendar** già installate.

Tabelle nuove, con RLS e nessun diritto diretto per `anon` e `authenticated`:
- `analytics_creative_assets`
- `analytics_creative_editorial_links`
- `analytics_creative_audit`

API protette `SECURITY DEFINER SET search_path=''`, con permessi owner/admin controllati sul database, non sul frontend:
- `analytics_creative_list(p_include_archived boolean)`
- `analytics_creative_save(p_asset jsonb)`
- `analytics_creative_link(p_editorial_id uuid,p_asset_id uuid,p_unlink boolean)`
- `analytics_creative_month_links(p_start_date date,p_end_date date)`

Helper interni: `analytics_creative_authorized()`, `analytics_creative_reset_editorial(uuid)`. La funzione di autorizzazione viene concessa ad `authenticated` esclusivamente come valore booleano per far funzionare le policy Storage.

Bucket Storage con policy solo per utenti `authenticated` **Analytics owner/admin**:
- `SELECT` per consultare e creare URL temporanei;
- `INSERT` solo nei percorsi `media/<uuid>.<formato consentito>`;
- `DELETE` per ripulire upload incompleti; l'app non mostra pulsanti di cancellazione delle risorse registrate.
- Nessun permesso anonimo, bucket privato, nessuna policy `UPDATE`, upload `upsert:false`.

**Nota sui dati personali:** le foto di ospiti o dipendenti possono essere dati personali **anche se il nome non è salvato**. Serve autorizzazione all'uso appropriata, informativa e base giuridica, specialmente per minori e uso pubblicitario. Non caricare foto non autorizzate né scrivere email/telefoni degli ospiti nei metadati.

## Installazione

1. Aprire la PR 14C, verificare GitHub Actions e anteprima Netlify verdi, fare `Ready for review → Merge pull request`.
2. Nel **progetto Supabase corretto** (Nonna Angela), aprire **SQL Editor**, creare una nuova query ed eseguire **una sola volta** l'intero file `supabase/migrations/20261108_analytics_creative_library.sql`.
   - Non riapplicare la migrazione 14B: deve essere già installata e funzionante.
   - L'SQL crea bucket, RLS, metadati e RPC. Non richiede webhook Telegram, Edge Functions o secret aggiuntivi.
3. Attendere il deploy Netlify della branch `main`, quindi aggiornare il sito (`Ctrl + Shift + R`).
4. Accedere come utente owner/admin: **Manager → Analytics → Creative Library**.
5. Concedere il permesso di caricare con una foto **di prova, di proprietà e autorizzata**, di dimensioni ridotte:
   - Titolo, categoria e tag; inizialmente diritti `unverified`.
   - Premere upload: deve apparire nella galleria privata senza alcun contenuto pubblico.
   - Verificare l'anteprima firmata. Su URL `getPublicUrl` non devono apparire risorse; l'archivio è privato.
6. Impostare i diritti a `cleared` solo dopo una verifica reale e specificare nella nota la licenza o il consenso.
7. Creare una voce **bozza** nel Calendario Editoriale dello stesso mese e dalla Creative Library collegare la foto:
   - Il calendario dovrà mostrare titolo e presenza del file.
   - Provare la revoca dei diritti: il file dovrà mostrare avviso e l'eventuale contenuto approvato in corso dovrà tornare in bozza con `rights_checked=false`.
   - Non simulare falsamente una pubblicazione: si può testare il passaggio di workflow fino all'approvazione senza selezionare `published`.
8. Provare l'archiviazione: la risorsa scompare dalla galleria predefinita, ma rimane nel bucket e può essere inclusa usando il filtro archivio.
9. Provare un utente anonimo o Analytics senza ruolo: il bucket e le RPC non devono essere accessibili.
10. Controllare che prenotazioni, bot Telegram, Analytics, La Famiglia e Growth Planner non abbiano subito modifiche.

## Limiti del MVP

- Upload per singolo file, senza progress bar/chunked upload e senza conversione HEIC/MOV.
- Senza compressione video server; limite 25 MiB.
- Ricerca e paginazione nella galleria lato client, fino a 300 risorse. Aumentando l'archivio, sarà necessaria una paginazione server e gestione dei costi Storage.
- L'uso di un'immagine in un calendario **non** carica automaticamente quel file sulla piattaforma di pubblicazione.
- Gli URL temporanei possono essere letti da chi li conosce finché scadono: evitare di condividerli.
- I diritti d'autore sono dichiarati e controllati dal personale, non analizzati automaticamente con AI.
- La migrazione e i test CI verificano codice e policy, **non equivalgono a collaudo su un database Supabase reale**.

## Roadmap

- 14A Growth Planner — integrato.
- 14B Calendario Editorial — integrato.
- **14C Creative Library — questa PR.**
- Valutare 14D: reporting creativo basato su dati verificati o integrazione piattaforme con API ufficiali; non attribuire conversioni/ricavi senza dati probanti.
- Audit finale dell'intero sito dopo le funzionalità concordate; ogni rischio critico di esposizione dati confermato va affrontato indipendentemente dal calendario dell'audit.
