# Documents V1 — D6 Document requirements and operational work

Director authorization: **D6 EXECUTION CONTINUATION** (2026-10-27). Sprint `OPWORK_AA660DC9554D_SPRINT_362F6FBDCB83`
(Core V2, promotion HELD until a certified checkpoint is released), lane `lane_aa660dc9554d`, run
`erun2_ff617f3c40838095` (the run first named, `erun2_a4d89cab16472e94`, was cancelled mid-session; the sprint is
unchanged). D7 (expiration/renewal) is out of scope.

## Starting position

| | |
|---|---|
| Sprint creation | `gar_5e973128bfc290` (`objective.govern_sprint`) complete: obligation `OPWORK_AA660DC9554D_SPRINT_362F6FBDCB83`, hold HELD, contributor `lane_aa660dc9554d` |
| Reconciliation | `gar_1ff355d90d2a87` (`repository.integrate_base`) complete: `agent/documents` `f523c2f37` + staging `b5abf2d02` → merge `0c46b4548` (tree `a79e6fe0`) |
| D5 | sprint closed; evidence PR #1605 CERTIFIED_NOT_PROMOTED; its six evidence commits (`13a2ec8c0`, `3b20baf55`, `b36980947`, `582f0a1c0`, `e1620a7fa`, `5fba7a7e5`) are on the lane branch, unchanged |
| Staging ledger head | `20261211090000` (total 547); D6 migration `20261212090000` sorts after it and collides with no branch |

## D6.0 — canonical authority

| Concern | Owner | How |
|---|---|---|
| Requirement definitions | **Documents** | `document_requirements` + immutable `document_requirement_versions` |
| Requirement satisfaction | **Documents** | ONE pure evaluator, `documentRequirementEvaluator.ts`; never stored |
| Document-specific waivers | **Documents** | `document_requirement_waivers` (grant/revoke functions only) |
| Readiness consumption | Business Process | participant progress asks `evaluateDocumentTypeRequirementsForChild`; it never reads document review state |
| Stage exceptions | Enrollment | `enrollment_requirement_exceptions`, unchanged; applied by completion sufficiency as before |

There is one requirement engine. Processing → Work → Documents, Work Items, the Focus Panel and Business Process all go
through `documentRequirementService.ts`.

## D6.1 — requirement configuration

Processing → Studio → Documents → **Requirements** (`ProcessingDocumentRequirementsStudio.tsx`); routes
`/api/admin/documents/configuration/requirements` (GET, POST), `…/[id]` (GET, PATCH archive/activate, DELETE),
`…/[id]/draft` (PUT, DELETE), `…/[id]/validate` (POST), `…/[id]/publish` (POST, compare-and-swap).

| Field | Values |
|---|---|
| Document type | a PUBLISHED, active Studio type (validated in the database at validate and again at publish) |
| Subject grain | household · person (adult) · child · opportunity (enrollment case); must be accepted by the type |
| Scope | `{kind:"all"}`, or `{kind:"business_process", process_key, stage_keys?}` (child, household or case grain) |
| Timing | `{kind:"immediate"}` or `{kind:"within_days", days 1–365}` from the record entering scope |
| Policy | `required` (blocks readiness, creates work) or `optional` (shown, never blocks) |
| Waiver eligibility | `waivable` true/false |
| Effective configuration | optional `effective_from` / `effective_until` |

Lifecycle as D3 types: draft → validated → published → superseded; a published version never changes; validation and
publication only through their functions; one open and one published version per requirement; archive (keeps versions
and waivers) and delete only when never published and never waived. One live definition per (type, grain, scope).

**QA fixture purge (slice 5, added before merge).** Hosted certification must publish and waive run-scoped requirements
in QA Shared and still bind ZERO_RESIDUE, which the history rule above made impossible. Fixture resets are hash-pinned
in the toolkit registry, so the in-repo governed path is the product's own audited route, as D2–D5 cleaned up through
audited deletes: `DELETE …/requirements/[id]` on an ARCHIVED requirement whose key starts with `qa_` calls
`document_requirement_purge` (service role; re-checks both; versions and waivers by cascade; audited `purge_fixture`).
Every other requirement keeps its history. Invariant 11 proves it; the census gains `doc_zr_d6_requirements`,
`doc_zr_d6_requirement_versions` and `doc_zr_d6_waivers`. This changed the candidate after the first release
(`spr_4e7438699164` for `81573d1b1501`), so it was re-certified and re-released.
The editor mirrors `document_requirement_version_problems`; a test pins the two code sets equal.

## D6.2 — the satisfaction evaluator

`evaluateDocumentRequirement({requirement, type, subject, documents, waivers, today})` — pure, deterministic.

| Precedence | Outcome |
|---|---|
| grain, effective window or scope does not reach the subject | not applicable (no result) |
| the type is no longer published/active, or no longer accepts the grain | **blocked** (`type_unavailable` / `type_subject_not_accepted`) |
| an available document whose current version is accepted (or needs no review) | **satisfied** |
| an active, unexpired waiver while the published policy still allows waivers | **waived** |
| an available document awaiting review (pending, or no review on a review-required type) | **pending review** |
| only quarantined / only rejected evidence | **blocked** (`evidence_quarantined` / `evidence_rejected`) |
| nothing | **missing** |

Deleted, restricted and superseded documents are never evidence. Evidence is the subject's OWNED documents of the
type (D2 owner associations). `blocking` = required and not satisfied/waived.

## D6.3 — waivers

`POST /api/admin/documents/requirements/waivers` (grant), `PATCH …/waivers/[id]` (revoke), `GET …/waivers?subject…`
(history). Explicit requirement and subject; `processing.documents.manage`; the subject in the actor's document scope
(404); clearance for the requirement's class (403 `SENSITIVE_REQUIREMENT`); reason and actor recorded; optional end
date; revocation with a reason; audit `document_requirement_waiver_granted` / `_revoked` before the database decides.
The database refuses a non-waivable policy, the wrong grain, a foreign or unknown subject, an archived requirement, a
missing reason and a second active waiver; a waiver is never edited or deleted.

## D6.4 — operational work

`GET /api/admin/documents/requirements/work` → derived rows for unmet REQUIRED requirements, in Processing → Work →
Documents → **Missing documents** (`ProcessingDocumentRequirementWork.tsx`; received documents stay the default view)
and in Work Items as source **Documents** (`mapDocumentRequirementToWorkItemRow.ts`), from one client read
(`documentRequirementWorkClient.ts`). Stable derived id `document_requirement:<requirement>:<grain>:<subject>`; never an
`operational_tasks` row; completion routes to the record's Documents card; excluded from due metrics like the other
projections. A row disappears on the next read once satisfied or waived, and moves to pending review while a document
awaits review.

## D6.5 — Focus Panel readiness

`DocumentReadinessPanel.tsx` above the D4 library (`GET /api/admin/documents/requirements/readiness`, the library's
anchor admission): required, on file, missing, pending review, waived and blocked, per household member; accept/reject
a pending document, waive, revoke; re-read after every write. The library list itself still derives nothing.

## D6.6 — Business Process integration

- `stageRequirementsV1`: `document` is authorable (consent, acknowledgment, signature stay refused).
- Lifecycle builder: a `document` requirement must name a published type a child can file (422 `unknown_document_type`).
- Participant progress: `projectDocumentRequirementsForChild` asks the Documents service (after forms, before financial);
  `satisfied`/`waived` → satisfied with `document_requirement` evidence; otherwise outstanding; an unreadable answer stays
  `unsupported` (blocking). When a live Documents requirement for the type reaches the child, its evaluation (and
  waivers) is the answer; otherwise the stage requirement is evaluated as required, non-waivable, by the same evaluator.
- Completion sufficiency and Enrollment stage exceptions are unchanged (an exception still excepts an outstanding
  document requirement without dressing it up as satisfied).

## D6.7 — security

See `docs/platform/governance/document-security-model.md` §7c. Version review (`POST /api/admin/documents/[id]/review`)
was added because nothing could accept or reject a version outside filing: `documents.write` + the full access decision
(quarantine cannot be reviewed), current version only, rejection needs a reason, `document_version_reviewed` first.

## D6.8 — certification

### Automated (local)

| Suite | Result |
|---|---|
| Postgres invariants `certification/invariants/documents-d6-requirements.sql` (shared local stack, D2/D3/D5/D6 applied inside a rolled-back transaction, D6 applied twice) | **11/11 PASS**; mutations (waivable check, type-grain compatibility, purge key namespace, purge archived-only) each fail it |
| `tests/documents` | **441/441** (383 before D6; D6 routes 37, UI 10, Business Process 11) |
| Mutation checks | removing work's clearance filter fails 1; removing both waiver scope gates fails 1 |
| Regression vs the unchanged base `0c46b4548` (`/tmp/d6-base`) | lifecycle + enrollment: identical 85 reds on both; 28 other importers of changed modules: identical 6; Work Items / processing / runtime / components: identical 22. **0 new reds** |
| Typecheck | `vac run typecheck` and `vac run typecheck:tests`: green |
| Prebuild guards | all pass (10 new routes declared) |

### Promotion, hosted certification and residue

Recorded below as they happen.
