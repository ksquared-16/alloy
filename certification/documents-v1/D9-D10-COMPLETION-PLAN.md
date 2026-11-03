# Documents V1 — D9 / D10 program completion plan (single scope)

**Status: PLAN (2026-11-02). Nothing below is implemented by this document.**
- Successor objective filed as `gar_513e95f1682b2e` (`objective.govern_sprint`, awaiting operator). If approved, its id is `OPWORK_AA660DC9554D_SPRINT_AFD07879C606`.
- Implementation starts only once a run is attributed to that objective.
- **Baseline, preserved and not reopened:** increment 1 (`OPWORK_AA660DC9554D_SPRINT_5D62877D85D6`). It shipped as PR #1627, merge `daf87893f879`, candidate `16df3acdafbf`, checkpoint `ick_b44b9be13ded`, release `gar_49fa76b4e33352` / `spr_3463b89be871` and merge request `gar_f125c27f5c5191`. Staging `/api/build-info` serves `daf87893`.
- `OPWORK_AA660DC9554D_SPRINT_6A4F60B1555E` (HELD, "preparation only: no new API/email implementation") is **not** reused. Amending it would change what it means. It stays open for its own R2/R5 preparation scope.

**Sources consolidated (every unfinished item is carried forward, including those beyond the operator's summary):**
- `D9-D10-ACCEPTANCE-PREPARATION.md` (§1.3, §1.4, §2.3, §2.4, §3, §4);
- `D9-D10-FIRST-INCREMENT-PROPOSAL.md` (§2.3, the ASSISTANT §8 list);
- `D9-D10-INCREMENT-1-RECORD.md` ("Still open in D9", the c2 external table (a)–(f), the deployment order, "Remaining for full acceptance");
- `D10-MALWARE-VERDICT-STORE-DESIGN.md` (§7);
- `D10-WS11-ATTACHMENT-STORAGE-DRAFT.sql`.

**How evidence is recorded:** each item keeps five separate columns of evidence, never merged:
**L** local implementation and proof · **H** hosted proof · **C** certification (checkpoint) · **D** deployment · **A** final acceptance.

## 1. D9 — external Documents API

| # | Requirement | Source | Owner | Depends on |
|---|---|---|---|---|
| D9-H1 | Hosted HTTP proof of D9.1 on deployed staging. Four operations; 403 without `documents.read` before any read; org B token → 404 for org A; `locations`-boundary refusal; indistinguishable 404 for medical / identity / custody / restricted / quarantined / foreign / withheld / missing; audited 10-minute download link with no storage path; paging | Record "Remaining" 3; proposal §3 | Documents | **DEC-1** (application credential), **DEC-2** (hosted QA run) |
| D9-W0 | Ratify the write contract. ASSISTANT §8 was never confirmed as ratified (proposal §0) | Proposal §0, §2.3 | Kelly | **DEC-3** |
| D9-W1 | Create, plus upload initiate / complete. Bytes enter through the admin upload path (storage, plus a Processing case or `commitDocumentFiling`); never a direct `documents` insert; idempotency key `ext:<installation>:<key>` → `filingKey`; failed / abandoned upload cleanup | Prep §1.3 (2, 4, 5), §1.4 (1, 2) | Documents | D9-W0 |
| D9-W2 | Metadata update, archive | Proposal §2.3 | Documents | D9-W0 |
| D9-W3 | Subject link / unlink through `document_link_subject` / `document_unlink_subject` only | Proposal §2.3 | Documents | D9-W0 |
| D9-W4 | Review submit and read | Proposal §2.3 | Documents | D9-W0 |
| D9-W5 | Requirements read and expiration query (`evaluateDocumentRequirement`, derived) | Proposal §2.3 | Documents | D9-W0 |
| D9-W6 | Version-aware replacement (`document_add_version`; `NEW_VERSION_REQUIRED` semantics) | Proposal §2.3 | Documents | D9-W0 |
| D9-W7 | Lifecycle history beyond `since_token` | Proposal §2.3 | Documents | D9-W0 |
| D9-X1 | Cross-cutting: `documents.write` scope; principal-to-actor adapter (installation and credential in the audit); boundary resolution of every named subject; stable refusal codes published (prep §1.2); write rate limit 120/60 s; OpenAPI and partner package regenerated | Prep §1.3 (1, 3, 6), §1.4 (3–6) | Documents with Developer Platform | D9-W0 |
| D9-H2 | Hosted proof of the write surface through the Application Principal path (live QA writes) | Operator, 2026-11-02 | Documents | DEC-1, DEC-2, D9-W1…X1 deployed |
| D9-N1 | Organization-wide feed: deliberately absent; stays absent unless decided | Record "Still open" | Kelly | DEC-3 |
| D9-N2 | Medical / identity / custody external access: no external clearance equivalent exists; stays invisible | Prep §1.3 (1); proposal §4 S3 | Kelly | DEC-3 |

## 2. D10 — inbound email attachments

| # | Requirement | Source | Owner | Depends on |
|---|---|---|---|---|
| D10-A1 | Atomic Processing open: single-session invariant (`certification/invariants/processing-open-case-atomic.sql`) on the isolated certification environment | Record c2.1, deployment order 2 | Documents (filing), DB (runs) | governed `database.run_rollback_invariant_test` |
| D10-A2 | Two-session race proof. **No governed action runs two sessions.** The rollback test is single-session and never commits, so a second connection cannot see the function | Record c2 (d) | Host Capacity / DB | **DEC-4** |
| D10-A3 | Move `pending-migrations/20261215093000_processing_open_case_atomic.sql` back unchanged (sha256 `f04e450c…`); governed staging apply after merge; ledger parity census | Record c4 | Documents, then DB apply | A1, A2, **DEC-7** |
| D10-S1 | WS11 `communication_message_attachments`, starting from the draft (plus `provider_attachment_id` for idempotency); RLS and `org_documents` bucket policy for the system writer (record c2 (f)); D2 insert trigger with explicit `current_version_id` confirmed on a real DB (c2 (e)) | Prep §2.3 (1); record c2 | Communications / DB | **HANDOFF-1** |
| D10-S2 | `AttachmentStorageBoundary` production implementation over S1 (replaces `UNAVAILABLE_ATTACHMENT_STORAGE`) | Record c2 table | Documents (consumer) with Communications | S1 |
| D10-M1 | Verdict-store migration and recording function, exactly per the design (I1–I6, append-only, unsafe dominates, revocation human-only); new system principal | Design §7 | Documents security | **DEC-5** |
| D10-M2 | Scanner integration: `MalwareScanBoundary` production implementation; missing / failed / inconclusive verdicts → held; structural screening never a verdict | Design; record c2 (c) | Documents security | DEC-5, **DEC-6** |
| D10-F1 | Resend fetcher wiring into production deps (adapter exists, not wired). **Implementation** is separate from **enabling real provider requests** | Record c2.3 | Communications | S2, M2, A3; **DEC-8** enables |
| D10-Q1 | Filing queue: `email_attachment` in `DOCUMENT_SOURCE_KINDS`; filing key `email_attachment:<message>:<document>`; unresolved subject → `awaiting_subject` | Prep §2.3 (2, 3), §2.4 (5) | Documents / Processing | — (local) |
| D10-V1 | Full-path validation: owned only; duplicate delivery; retries; unauthorized / cross-org; fetch, store, scan or open failure recovery; no duplicate cases; no orphaned objects; unsupported or oversized files recorded, not dropped; no outbound send | Prep §2.4 (1–6); operator | Documents | S2, M2, A3, F1 |
| D10-H1 | Hosted proof of the inbound path with real provider traffic | Operator | Documents with Communications | DEC-2, DEC-8 |

## 3. Paperwork accountability (prep §3): not silently included or dropped

Prep §3 is design only and is not named in the operator's D9/D10 instruction. It needs **DEC-9**: in scope here, or tracked as a separate objective.

## 4. Decisions (prepared; none is a filed card unless marked FILED)

| Id | Decision | Recommendation | Consequence |
|---|---|---|---|
| DEC-0 | Successor objective | Approve `gar_513e95f1682b2e` — **FILED** | No implementation run can be attributed until it is approved |
| DEC-1 | Hosted application credential | A dedicated staging QA developer application, installation and credential with `documents.read` (later `documents.write`), org-wide plus one `locations` installation, in the certification QA org. Filed via `platform.register_developer_application` when the run exists; the installation and credential issuance path still has to be confirmed | Without it, D9-H1 and D9-H2 cannot run; no existing credential is borrowed |
| DEC-2 | Hosted QA authority | `environment.qa_run_open` on `alloy_staging_web` with `hosted_qa_authority` declared: fixture documents per sensitivity, two orgs, then close with a zero-residue census | Live QA writes on hosted staging |
| DEC-3 | D9 write contract | Ratify ASSISTANT §8 as the D9 contract: standard sensitivity only; no medical / identity / custody externally; no org-wide feed; `documents.write` scope | Unblocks D9-W1…W7 |
| DEC-4 | Two-session race proof | Ask Host Capacity for a governed concurrency harness on the certification environment. Alternative: approve running it on the local shared `alloy-cert` stack (not isolated) | No staging apply of the migration until proven |
| DEC-5 | Verdict store | Authorize authoring (not applying) the design's migration and function, principal `malware_scan_worker` | Unblocks D10-M1 locally |
| DEC-6 | Scanning service | Self-hosted ClamAV (`clamd`) in an operator-owned container worker, so child documents never go to a third-party scanning vendor. A hosted scanning API is the lower-ops alternative and needs a data-processing review. **Never** a public multi-scanner service that shares samples. The worker reads bytes through short-lived signed URLs and writes verdicts only through the recording function, with its own secret | Needs operator-owned infrastructure, billing and a secret; until then everything stays held |
| DEC-7 | Staging migration applies (atomic open, WS11, verdict store) | One governed apply per migration after its merge, each with a parity census | Each is a separate card when ready |
| DEC-8 | Enabling real Resend attachment requests | A separate activation after hosted proof of storage, scanning and atomic open | Until then the fetcher is unwired or disabled; D10 holds |
| DEC-9 | Paperwork accountability | Track as its own objective | Keeps this program's acceptance bounded and honest |

## 5. Handoffs (for the operator to paste to the owning lane)

- **HANDOFF-1 (Communications / DB):** turn `certification/documents-v1/D10-WS11-ATTACHMENT-STORAGE-DRAFT.sql` into an owned migration. Accept or reject `provider_attachment_id`. Add RLS plus `org_documents` bucket policy for the system writer. Confirm the D2 insert trigger with explicit `current_version_id` on a real DB. The consumer contract is `AttachmentStorageBoundary` in `web/lib/documents/inbound/inboundAttachmentFiling.ts`. Deliver the migration on a branch; Documents implements the boundary against it.
- **HANDOFF-2 (Host Capacity):** a governed two-session concurrency proof on the certification environment for `open_processing_case_with_primary_source` (DEC-4).
- **HANDOFF-3 (Documents security):** D10-M1 / M2 once DEC-5 / DEC-6 are decided. Documents can author M1 itself if security assigns it.

## 6. Order of work once the run is attributed

1. Local, no external dependency: D10-Q1; D9-X1 adapter and scope skeleton; D10-A1 filing; S2 boundary against the draft schema; M1 authoring after DEC-5.
2. After DEC-3: D9-W1…W7 as slices, with targeted Tier 1 per slice.
3. After DEC-1 / DEC-2: D9-H1 on the deployed base, then D9-H2 after the write surface deploys.
4. After HANDOFF-1 / -2 and DEC-6: F1 wiring (disabled), then D10-V1.
5. Integrate on staging, one checkpoint, preview with provenance, release, one PR, CI, approved merge, migration applies, hosted proofs, acceptance.

## 7. Status — 2026-11-03, run `erun2_b2876b539106263e` (objective `…AFD07879C606`, filed and approved as `gar_513e95f1682b2e`)

Evidence columns:
- **L** local implementation and proof · **H** hosted · **C** certification · **D** deployment · **A** acceptance.
- `—` = not yet. Nothing below is certified, deployed or accepted.

| Item | L | H | C | D | A | Next step / owner |
|---|---|---|---|---|---|---|
| D9-H1 hosted read proof | — (D9.1 code is deployed via #1627) | — | — | ✔ D9.1 code at `daf87893` | — | Plan `D9-1-HOSTED-QA-PLAN.md` prepared. Blocked on H2 (Host Capacity QA plan), then DEC-1 / DEC-2 cards |
| D9-W0 write contract | Proposal `D9-WRITE-CONTRACT-PROPOSAL.md` | — | — | — | — | **Kelly ratifies** (DEC-3). Until then no write is implemented |
| D9-W1…W7, X1, H2 | — | — | — | — | — | After DEC-3 (Documents), then H2 / DEC-1 / DEC-2 for the hosted proof |
| D9.2 write surface (ratified Q1–Q8) | ✔ `2181bf936`…`30f71b2ee`: upload, content, filing, link/unlink, sweep, publication | — | — | — | — | Hosted proof D9-H2 (DEC-1 credential, DEC-2 hosted QA run) after deploy |
| D9.2 unfiled-upload escalation (operator-approved 2026-11-03) | ✔ `88ebd3848`: 24 h grace → one Processing case per upload, atomic open only, audited, late filing closes the case; 13 + 2 tests | — | — | — | — | **Inert until D10-A3** applies `open_processing_case_with_primary_source` (held, never the legacy open). Hosted: a wake with an aged QA upload |
| D9.3 lifecycle (review, validity, replacement, archive, reviews, history, requirements, expires_before) | ✔ `6b3c80f8f`, publication `aae87158f`: 18 route-level tests; 38 operations / 34 paths / 16 scopes | — | — | — | — | Hosted proof with a `documents.review` grant (DEC-1 extended) |
| D9.3 archive migration | Recorded `880238d8e` (`pending-migrations/20261217090000_documents_d9_3_archive.sql`, `D9-3-ARCHIVE-MIGRATION.md`); SQL not exercised | — | — | — | — | **Approval to apply** (DEC-7 family). Until applied, archive answers 503 `archive_unavailable` |
| D9 application-as-actor filing / replacement on an isolated DB | Synthetic only | — | — | — | — | **Environment not ready:** `alloy-cert` ledger max `20261210090000`, no Documents D2–D8 functions (checked 2026-11-03). Needs a governed cert rebuild or migration of the shared stack |
| D9 10 MB upload path | Recommendation recorded (`D9-UPLOAD-LIMIT-10MB-PATH.md`); 4 MiB stated in responses and docs | — | — | — | — | Decision on option A, then implementation and a hosted 10 MB assembly proof |
| D10-Q1 filing queue | ✔ already in increment 1 (`email_attachment` in `DOCUMENT_SOURCE_KINDS`) | — | ✔ (#1627) | ✔ | — | Verify in D10-V1 |
| D10 never-release rule | ✔ `65f442e62`: structural-only policy removed; mutation caught | — | — | — | — | — |
| D10-A1 single-session invariant | Invariant file prepared (increment 1) | — | — | — | — | Needs migration `20261215093000` on a certenv (`database.apply_migration`, from a pushed `agent/**` commit), then `database.run_rollback_invariant_test`. Prepared, not filed |
| D10-A2 two-session race | — | — | — | — | — | **H1** Host Capacity fixture `processing_atomic_open_race` |
| D10-A3 staging apply of `20261215093000` | — | — | — | — | — | After A1 + A2, merge, then a `database.apply_promoted_migration` card (DEC-7) |
| D10-S1 WS11 link + access rules | Draft only | — | — | — | — | **H3** Communications / DB |
| D10-S2 storage boundary | ✔ increment 1 (`ws11AttachmentStorage.ts`, stable document id) | — | ✔ (#1627) | ✔ (unwired) | — | Re-prove with H3's link and access rules on certenv |
| D10-M1 verdict store | ✔ `fd72f0cf0`: pending migration `20261216090000`, invariant (9 cases, not run), app read / record / revoke | — | — | — | — | **H4** security review; a certenv run needs the apply; staging apply is DEC-7 |
| D10-M2 scanner integration | ✔ `e0dfa2121`: scan step (re-hash, fail closed) and clamd INSTREAM engine; unwired | — | — | — | — | **DEC-6** engine and host (H4); enabling is separate |
| D10-F1 Resend fetcher wiring | Adapter ✔ (increment 1), not wired | — | — | — | — | **H3** wiring behind a disabled flag; **DEC-8** activation |
| D10-V1 full path | Composed synthetic suites green (`tests/documents`: 40 files after slice 3) | — | — | — | — | After S1, M2 and A3 on certenv |
| Revocation route (design §3) | Library ✔; admin route — | — | — | — | — | Documents, after H4 review |
| Paperwork accountability | — | — | — | — | — | **H5** owner; DEC-9 |

**Validation of `e0dfa2121`** (tree `390d54fb8733b498`, receipts in the broker):
- `typecheck` PASSED (`req_1793674568453259_85275`);
- `typecheck:tests` PASSED (`req_1793674589777929_91620`);
- module imports PASSED (`req_1793674635954384_99176`);
- prebuild guards: service-client-principal, unauthenticated-side-effects, route-capabilities, runtime-mode-audience and governed-documents, all rc=0.

**Baseline red seen:** `tests/access/orgParameterizedRpcBoundary.test.ts` › "no later migration grants a client EXECUTE…" flags committed `20261204090000_medical_rows_require_health_permission.sql`, which this sprint does not touch. Neither that test nor `supabase/migrations` differs from the deployed base `daf87893` (`git diff` empty), so it fails identically there. It is pre-existing.

**`tests/access` baseline (measured 2026-11-03):** 21 failures at `9530e9b16`, all also failing on an exported copy of the deployed base `daf87893`, which shows 22. The extra base failure (`roleKeyIntegrityAndGrantReplacement` › "anything this lane has NOT yet merged…") reads git history, which an exported copy lacks. This sprint introduces no access-lock failure. Affected suites at `9530e9b16`: `tests/documents`, `tests/communications/inbound*` and `processingCaseAtomicOpen` all green.

**No production build yet.** One build happens at the integrated checkpoint.
