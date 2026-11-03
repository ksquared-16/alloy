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
