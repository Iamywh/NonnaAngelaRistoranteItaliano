# Audit remediation — 14 November 2026

Reference: audit 12 November, main `003fbd5e80999f459cbb802440139479f528085f`.
No production changes or real customer/stock/financial writes. Status is code/test status, not deployment status.

| ID | Priority | Evidence / cause | Implementation / verification | Status |
|---|---|---|---|---|
| BOOK-01 | P0 | Locale references undefined closure variables | Shared form/assistant slot calendar; strict dates and Canary today; translated closures; disabled unsafe submission; render regression in 4 languages and schedule tests | Corrected: PR #46; 245 tests pass / 6 TODO; not deployed |
| ALERT-01 | P1 | reportMonths rejects 2 requested by Alertas | Accept two-month periods, catch network rejections; DOM test loads December/January, refreshes and displays network errors | Corrected: PR #47; not deployed |
| BOOK-02 | P1 | Public assistant reads future reservations then filters phone | Requires scoped credential flow, legacy fallback and server validation | Confirmed |
| OCR-01 | P1 | Hardcoded quantities/prices presented as OCR | Explicit labelled/Orthidal-column parser; evidence retained, unknowns null, arithmetic validation, approval resets on edit | Corrected: PR #47; not deployed |
| MANUAL-01 | P1 | Audit live PDF authorization differed from repository | Supabase connected: deployed v17 still requires shared password; four private PDFs exist. JWT + active owner/admin handler tested | Prepared; awaiting production approval |
| BOOK-03 | P1 | Client capacity check and INSERT separate; configured 50 not verified | Server transaction/concurrency validation; capacity business decision outstanding | To verify database |
| NOTIFY-01 | P1 | Arbitrary browser notification payload, no persistent retry | Server-backed outbox and trusted destination | Confirmed code |
| SEC-01 | P1 | Historical TRUNCATE grants | Confirmed effective TRUNCATE grants; tested revocation migration preserves reads and service role | Prepared; awaiting production approval |
| SEC-02 | P1 | Private food costs in menu JSON included in public bundle | Build-time projection strips private fields from menu and bot JSON before bundling; private costs remain RPC-backed | Corrected locally |
| DEP-01 | P1 | Audit dependency advisories | Targeted compatible updates; npm audit 8 → 0 findings (14 November) | Corrected locally |
| UI-01 | P2 | Mixed translations, contrast, overlapping overlays, empty pairing | Removed welcome interruption, empty pairing headings; opaque contrasting form; full language/mobile review outstanding | Partial |
| UI-02 | P2 | Manager navigation / duplicated F&B view / developer messages | Group modules, preserve deep links and simplify messages | Pending |
| AUTH-01 | P2 | Missing password reset | Recovery request + secure recovery-session flow | Pending |
| SEO-01 | P2 | Metadata and real links missing | Real navbar links, localized metadata/canonical, sitemap, Restaurant JSON-LD without unverified postcode/hours | Corrected locally |
| PERF-01 | P2 | Eager private imports; 1479.50 kB main bundle | Lazy Manager modules: main JS 1481.29 → 620.61 kB; gzip 444.48 → 179.36 kB | Corrected locally |
| DATA-01 | P2 | Scenario vs actual/monthly vs quantity concepts | Preserve semantics; do not turn unknown values into zero | Pending |
| OPS-01 | P2 | Notification visibility, DST, stale inventory | Existing isolated tests plus staging integration | Pending |
| PRIV-01 | P2 | Incomplete privacy information | Technical inventory; owner/retention need confirmation | Pending |
| QA-01 | P1 | Only one live role audited; six TODOs | Isolated writes, role matrix, browser/mobile, export/upload, restore | Pending |

## Release and rollback

BOOK-01 is frontend only: review PR → preview build → exercise closed/open/holiday dates in ES/EN/IT/FR → approve merge/release → verify production. No SQL or function deployment. Roll back by restoring prior frontend release. This does not resolve server-side capacity or notification guarantees.

## Staff note

Closed dates now show an explanation rather than a blank page. Requests still need staff confirmation. No roles, capacity, customer records or notification recipients changed.

## Verification limits

Render tests execute the actual form and translations with synthetic initial dates and no Supabase calls; calendar tests include malformed dates, holidays and Canary timezone. They are not browser E2E or physical-device tests. Production backend checks, test Telegram destination and isolated restore still require the corresponding environment.

## P1 Alertas / OCR validation

249 tests pass, 6 pre-existing TODO. Alertas DOM integration uses mock Supabase (no network). Invoice tests reproduce 3 kg × 99 = 297, decimal ambiguity, missing/inconsistent fields and Orthidal units. No universal OCR claim: only preserved table columns or explicitly labelled rows; image recognition remains subject to manual checking. Frontend-only preview/release after #46; rollback frontend.

## Public bundle / quality release

250 tests passed, six existing TODO; build passed after dependency updates. Main 620.61 kB (179.36 kB gzip), still emits a >500 kB warning. No Lighthouse or device performance claim. DOM tests are not physical mobile checks. No production merge/deploy.

Build-time stripping removes purchase prices and margins from downloadable JSON modules, including bot wine knowledge. Private field names can still occur in calculation code; that does not mean private values are embedded. This cannot retract historic deployments, caches or already-public Git history. Restrict repository visibility / history remediation separately if those historical values must be confidential.

Release order: #46 → #47 → public-bundle PR, retarget stacked PRs to main as predecessors merge. Frontend only; no SQL/Edge deployment in these changes. Restore previous deployment for rollback, noting that it would restore the previous bugs and bundled values.

Remaining backend work: inspect deployed schema/grants/triggers and manual function, then implement scoped reservation access, atomic validation and persistent notification outbox. Do not deploy speculative migrations without verifying the existing database. Capacity value is not yet approved; 50 remains legacy UI configuration, not a physical capacity guarantee.

## Backend inspection — 14 November, after Supabase connection

Read-only live checks confirmed the obsolete manual function, excess TRUNCATE and table-wide anonymous INSERT. Prepared two SQL migrations and tested private-PDF handler; 255 tests pass, six TODO. No production changes. See docs/deployment/audit-backend-access.md for exact release/verification/rollback.

The missing blocked-slot trigger and absent server-side booking validators are now confirmed database findings. Protected customer lookup/modification, atomic availability and notification outbox remain unfinished, not fixed by permission narrowing. Full mobile, translations, password recovery and remaining QA remain open.
