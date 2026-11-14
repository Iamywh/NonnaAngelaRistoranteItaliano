# Audit remediation — 14 November 2026

Reference: audit 12 November, main `003fbd5e80999f459cbb802440139479f528085f`.
No production changes or real customer/stock/financial writes. Status is code/test status, not deployment status.

| ID | Priority | Evidence / cause | Implementation / verification | Status |
|---|---|---|---|---|
| BOOK-01 | P0 | Locale references undefined closure variables | Shared form/assistant slot calendar; strict dates and Canary today; translated closures; disabled unsafe submission; render regression in 4 languages and schedule tests | Corrected locally; not deployed |
| ALERT-01 | P1 | reportMonths rejects 2 requested by Alertas | Pending integration fix | Confirmed |
| BOOK-02 | P1 | Public assistant reads future reservations then filters phone | Requires scoped credential flow, legacy fallback and server validation | Confirmed |
| OCR-01 | P1 | Hardcoded quantities/prices presented as OCR | Replace with evidence-preserving parser and explicit review | Confirmed |
| MANUAL-01 | P1 | Audit live PDF authorization differed from repository | Verify deployed function/JWT against current role contract | To verify live |
| BOOK-03 | P1 | Client capacity check and INSERT separate; configured 50 not verified | Server transaction/concurrency validation; capacity business decision outstanding | To verify database |
| NOTIFY-01 | P1 | Arbitrary browser notification payload, no persistent retry | Server-backed outbox and trusted destination | Confirmed code |
| SEC-01 | P1 | Historical TRUNCATE grants | Inspect effective grants and role matrix, isolated DB tests | To verify database |
| SEC-02 | P1 | Private food costs in menu JSON included in public bundle | Separate public catalog, check every emitted asset | Confirmed audit |
| DEP-01 | P1 | Audit dependency advisories | Refresh audit and targeted updates | To verify |
| UI-01 | P2 | Mixed translations, contrast, overlapping overlays, empty pairing | Four-language, responsive and keyboard checks | Pending |
| UI-02 | P2 | Manager navigation / duplicated F&B view / developer messages | Group modules, preserve deep links and simplify messages | Pending |
| AUTH-01 | P2 | Missing password reset | Recovery request + secure recovery-session flow | Pending |
| SEO-01 | P2 | Metadata and real links missing | Metadata, sitemap, verified structured data | Pending |
| PERF-01 | P2 | Eager private imports; 1479.50 kB main bundle | Lazy load; compare asset sizes (not Lighthouse) | Pending |
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
