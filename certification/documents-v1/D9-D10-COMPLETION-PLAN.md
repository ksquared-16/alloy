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
| DEC-10 | 10 MB partner uploads | Keep 4 MiB for this program's acceptance, and run option A (parts through Alloy) as a follow-on slice once D9 is live (`D9-UPLOAD-LIMIT-10MB-PATH.md` §Assessment) | Until recorded, 4 MiB stays stated everywhere |

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

## 7. Status — 2026-11-03, run `erun2_91771ceae4599d00` (objective `…AFD07879C606`)

**Candidate and baseline.**
- Branch `agent/documents`.
- The 15 registered slices (`d10-no-structural-only-release` … `d9-status-and-inventory`) are all ancestors of the candidate.
- Current staging `7e9b242c` is integrated by merge `65f334c78`: 17 commits, no migration, one disjoint `web/package.json` hunk.
- All lane commits are authored `Kelly` and carry the Claude co-author line. Git authorship cannot identify which agent wrote a commit; the slice records name the runs.
- Deployed staging still serves increment 1 (`daf87893`, PR #1627). Nothing from this program is deployed.

**Evidence columns:**
- **L** local implementation and proof, **R** real-database proof (isolated certenv), **H** hosted, **C** certification checkpoint, **D** deployment, **A** acceptance.
- `—` means not yet. Nothing below is certified, deployed or accepted unless its column says so.

| Item | L | R | H | C | D | A | Owner, then next step |
|---|---|---|---|---|---|---|---|
| D9-H1 hosted read proof | ✔ D9.1 (increment 1) | — | — | ✔ #1627 | ✔ `daf87893` | — | Host Capacity **H2** (QA plan) → DEC-1 app cards → DEC-2 hosted run (`D9-1-HOSTED-QA-PLAN.md`) |
| D9.2 write surface (Q1–Q8) | ✔ `2181bf936`…`30f71b2ee` | Invariant `documents-d9-application-filing.sql` prepared, **not run** | — | — | — | — | Documents: run on certenv (§8). Then hosted D9-H2 (`D9-2-3-HOSTED-QA-PLAN.md`) after deploy |
| D9.2 24 h unfiled-upload handoff | ✔ `88ebd3848`, 13 + 2 tests | SQL half (one case per upload) in `processing-open-case-atomic-preapply.sql`, **not run** | — | — | — | — | **Inert until D10-A3** applies the atomic open. Hosted W-ES after that apply |
| D9.3 lifecycle (review, validity, replacement, archive, reads) | ✔ `6b3c80f8f`, `aae87158f` | Replacement with no user in the application-filing invariant, **not run** | — | — | — | — | Hosted W-RV1…W-RQ1 with `documents.review` (§2 of the D9.2/3 plan) |
| D9.3 archive migration `20261217090000` | Recorded `880238d8e` | `documents-d9-3-archive-preapply.sql` (migration inside the rollback), **not run** | — | — | — | — | Certenv run (§8), then **apply approval** (DEC-7). Until applied: 503 `archive_unavailable` |
| D9.3 staff restore | ✔ `01141ac30`: archived listing, restore route, library section, 8 tests | In the archive pre-apply invariant (`document_unarchive`) | — | — | — | — | Same apply as archive. Hosted W-AR2 |
| D9 10 MB uploads | Option A recorded (`D9-UPLOAD-LIMIT-10MB-PATH.md` §Assessment) | — | — | — | — | — | **Kelly: in or out of this program** (DEC-10). 4 MiB stays until recorded |
| D9-N1 / N2 (no org-wide feed; no medical / identity / custody externally) | ✔ ratified, enforced | — | — | — | — | — | — |
| D10-Q1 filing queue | ✔ increment 1 | — | — | ✔ #1627 | ✔ | — | Verify in D10-V1 |
| D10 never-release rule | ✔ `65f442e62` | — | — | — | — | — | — |
| D10-A1 single-session atomic open | ✔ invariant (increment 1) | `processing-open-case-atomic-preapply.sql` (no apply needed), **not run** | — | — | — | — | Documents: certenv run (§8) |
| D10-A2 two-session race | Runner `qaProcessingAtomicOpenRace.mjs` (`ca340723e`) | — | — | — | — | — | **Host Capacity H1**: register fixture `processing_atomic_open_race`. Its precondition needs the migration applied **on the certenv** (an isolated apply, not staging) |
| D10-A3 staging apply `20261215093000` | — | — | — | — | — | — | After A1 and A2, merge, then `database.apply_promoted_migration` (DEC-7) |
| D10-S1 WS11 link + access rules | Draft SQL only | — | — | — | — | — | **Communications H3** |
| D10-S2 storage boundary | ✔ increment 1 | — | — | ✔ #1627 | ✔ (unwired) | — | Re-prove with H3 on a certenv |
| D10-M1 verdict store | ✔ `fd72f0cf0` (pending `20261216090000`, invariant not run) | — | — | — | — | — | **Documents security H4** review. A pre-apply variant is possible, like archive (it needs only GRANT EXECUTE written as GRANT ALL) |
| D10-M2 scanner integration | ✔ `e0dfa2121`, unwired | — | — | — | — | — | **DEC-6** engine and host (H4) |
| D10-F1 Resend fetcher wiring | Adapter ✔, not wired | — | — | — | — | — | **H3** wiring behind a disabled flag; **DEC-8** activation |
| D10-V1 full inbound path | Synthetic suites green | — | — | — | — | — | After S1, M2, A3 on a certenv |
| D10-H1 hosted inbound proof | — | — | — | — | — | — | DEC-2 + DEC-8 |
| Paperwork accountability | — | — | — | — | — | — | **Enrollment / BP H5**, DEC-9 |
| Certification of the integrated candidate | — | — | — | Pending this run (§9) | — | — | Documents |

## 8. Real-database proof: the supported isolated path

**Tier 1 correction (2026-11-03).** The previous run reported a "toolkit packaging gap" because
`vacilando-suite --tier=1` found no `tests/deterministic`. That suite is **Vacilando's own** Tier 1. An Alloy sprint
checkpoint is certified differently: by the `vacilando.product_certification.v1` ledger, composed from exact-commit
`validate-results`. Those are a full `build`, a full `typecheck` (or the build's typecheck graph) and a `test` record,
each stable and on a clean tree (`lib/product-repository-certification.mjs`, `ALLOY_PRODUCT_CERTIFICATION`). `vac run`
produces them. Nothing is missing from the toolkit, and no Host Capacity work is needed for it.

**The isolated database is a certenv.** It is built by `environment.build_certification_baseline` from the staging tip,
as R3 did (`certenv-55644086aa`). The lane's earlier certenvs (`…55644086aa`, `…9c24631afd`) have expired leases at
older bases. The shared `alloy-cert` stack is **not** used: it is 47 migrations behind and not isolated.

**No migration has to be applied to prove the held ones.** The rollback runner allows `CREATE OR REPLACE FUNCTION`
and `ALTER TABLE` inside its discarded transaction. So each pre-apply invariant carries its pending migration byte for
byte (locked by `web/tests/documents/preapplyInvariantParity.test.ts`), then its assertions. Nothing persists, and the
runner verifies that from an independent connection.

| Invariant (sha256) | Proves | Needs |
|---|---|---|
| `documents-d9-application-filing.sql` (`aa5c43e4…`) | Application-as-actor filing and replacement with no user | staging-tip certenv |
| `documents-d9-3-archive-preapply.sql` (`b4f15bbd…`) | Archive and staff restore, archived unavailable everywhere | staging-tip certenv |
| `processing-open-case-atomic-preapply.sql` (`64c2461b…`) | D10-A1 single session; the SQL half of the 24 h handoff | staging-tip certenv |

All three pass the installed toolkit's `analyzeRollbackSafety` statically. **None has run.**

**Order of requests** (each its own operator approval; payloads under `.vacilando-payloads/d9d10-*.json`):
1. `repository.push` of `agent/documents` at the certified candidate. A rollback source must be on a sanctioned
   certification ref.
2. `environment.build_certification_baseline` at staging `7e9b242c`, lease to this lane.
3. Three `database.run_rollback_invariant_test` cards, one per file above, against the new certenv.

**Not covered by this path:**
- The two-session race (D10-A2, Host Capacity H1).
- The 24 h handoff end to end through the wake (TypeScript over a live database). Its proof is hosted W-ES after the
  atomic-open apply.

## 9. Validation record for this run

See the run report. The `tests/access` baseline reds are unchanged and pre-existing on plain staging `7e9b242c`.
They include `routeCapabilityDeclaration` ("ratchets the pending backlog downward", "an unlisted pending handler still
breaks the ratchet"): pending is 294 against a ceiling of 295 on staging itself, measured in a detached worktree.
