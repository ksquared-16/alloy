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
audited deletes: `DELETE …/requirements/[id]?qa_run_id=qar_<run>` calls `document_requirement_purge` for an ARCHIVED
requirement only when the organization is a registered QA organization (QA Shared / QA Secondary; never Firefly or a
tenant) and the key is in that run's namespace (`qa_<run>_…`); the database re-checks every bound, every refusal raises
before any row is touched, versions and waivers go by cascade, and the audit (`purge_fixture`) names the run. The history
guards honour the purge only when running as the purge function's owner, so a service-role session that sets the purge
setting itself is still refused. Every other requirement keeps its history.

*Ownership repair (slice 6, release preflight).* As first released, the purge bound only the `qa_` key and the caller's
own organization: an administrator of any tenant could create a `qa_…` requirement, publish, waive, archive and purge
its history, and any service-role session could set the purge setting and delete history directly. Slice 6 binds the
organization and run as above (signature `document_requirement_purge(uuid, uuid, text)`; the two-argument form is
dropped) and closes the setting bypass. Invariant 11 proves it; the census gains `doc_zr_d6_requirements`,
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

| Step | Evidence |
|---|---|
| Merge | PR #1605 merged as `1492a2dd9fdbb36cde05db1e734e71b550e875dd` (`gar_e116e09609e758`, release `spr_f32e5f74b3a3` for checkpoint `ick_9fd5861b6730` / `dfa2fc79837a`) |
| Migration | `20261212090000` registered by the merge's Supabase integration; physical-state census `gar_1344ea127f1c6b` **20/20 true**; documents/versions 378/378 intact (`d6-requirements-physical-state-census.sql.results.json`) |
| Deployment | staging `/api/build-info` gitSha `1492a2dd9fdbb36cde05db1e734e71b550e875dd`, deployment `dpl_H9cyKSZcBYGAABiaUkENGkviyJ5h`, Supabase `ikaxilmwmrmbagoidedu` — read before the run and again before certify (2026-10-27 ~15:38Z and ~15:49Z) |
| Stale release | `spr_094ccaabc8c8` (checkpoint `ick_6ffc98180fb1`, candidate `6995e65b`, before the slice-6 repair) was revoked by the toolkit itself when `ick_9fd5861b6730` superseded its checkpoint (`sprint-objective.mjs`: "superseded by …"), then replaced in the sprint's single release slot by `spr_f32e5f74b3a3`; the hold is PROMOTED. It survives only as a history row and can authorize nothing (`sprintHoldDecision` reads the current slot; `applyRelease` refuses a PROMOTED sprint). No revocation was filed: there is no live release to revoke, and a revocation could only touch the current authority |

#### Hosted certification — run `qar_af1c638fd52a` (authz_q1, `alloy_staging_web`, hosted authority declared)

Opened by `gar_979f192ad518f1` on run `erun2_a8cdd83d5836194a`. Fixtures seeded by `gar_d95cc0973a3a9b` (vendors),
`gar_dac40b5e248865` (subjects), `gar_ef01ec315dfd8c` (secondary).

| Gate | Result | Evidence |
|---|---|---|
| **D6 requirements** (`d6_hosted_requirements_cert.py`) | **73/74** | `d6_hosted_requirements_cert_results.qar_af1c638fd52a.json` |
| Q1 authorization | 90/90 | `q1_hosted_authz_cert_results.qar_af1c638fd52a.json` |
| D1b security | 37/37 (+ lead deletion 7/7) | `d1b_hosted_security_cert_results…`, `d1b_lead_delete_results.qar_af1c638fd52a.json` |
| D2 foundation | 40/40 | `d2_hosted_foundation_cert_results.qar_af1c638fd52a.json` |
| D3 Studio | 40/40 | `d3_hosted_studio_cert_results.qar_af1c638fd52a.json` |
| D4 household library | 41/41 | `d4_hosted_library_cert_results.qar_af1c638fd52a.json` |
| D5 Processing filing | 59/59 | `d5_hosted_filing_cert_results.qar_af1c638fd52a.json` |
| Browser walk (`d6_hosted_browser_walk.mjs`) | 5/8 | `d6_hosted_browser_walk_results.qar_af1c638fd52a.json`, `d6-human-qa/` |

The D6 driver covers, from every persona: authoring authority (only `processing.documents.manage` creates); database
validation (a child-only type refused for a household); delete of a never-published requirement, refusal for a
published one; invalid key; validate → publish with compare-and-swap; one live definition per (type, grain, scope);
missing → satisfied (no-review type) with the work row disappearing; a medical requirement invisible (readiness and
work) to a reader without `health.view`; pending review → rejected (reason required) → blocked → accepted → satisfied;
review authority (`documents.write`), cross-organization 404; waivers (non-waivable, reason, grain, authority,
cross-organization, a second active waiver, waived → not blocking, work gone, history with clearance filtering,
revoke, revoke twice refused, work back); quarantined evidence blocking without disclosing its id, and not reviewable;
department-restricted and cross-organization isolation; revision (v2 optional, supersedes v1, history kept, optional
never blocks or makes work); archive (stops applying, cannot be waived, never deleted without the run's id, another
run's id refused).

**The one failure is a product defect, recorded and not repaired in D6:** after rejecting and then accepting the same
version, the document history showed only "Review accepted". `documentHistory.ts` derived review entries from the
version row's CURRENT `review_status`, so each decision overwrote the last; the audit stream (`document_version_reviewed`)
held both. D7.2 repairs it with an append-only review history (`document_version_review_events`, migration
`20261213090000`) and is certified locally (`D7-REVIEW-EXPIRATION-RENEWAL.md`); it is not deployed.

**Browser walk** (fixture_admin session, visible controls; the run's requirement re-published as required v3 for the
walk): Processing → Work → Documents → Missing documents lists the unmet requirement per child with due dates
(`within_days 14`), Satisfied children absent, the row detail names the action, the due date and a reason-required
waive (`01-missing-documents.png`, `02-missing-row-detail.png`); Studio → Documents → Requirements lists it
(`03-studio-requirements.png`); the surfaces read only `GET …/requirements/work` and `GET …/configuration/requirements`.
**Not reached by clicking:** the Focus Panel readiness card. "Open the record's documents" on a child row lands on the
child's durable record, which on QA Shared's published child surface has no Documents card (`05a-open-record-child-view.png`);
search reached the adult's staff surface (`05c-adult-opened.png`). Readiness itself is certified through the API above
(and D4.7 reached the library through the case Focus Panel's Activity → Documents). Carried as a D7.4 finding; it needs a
Human-QA decision on where a child's Documents card lives.

#### Teardown and ZERO_RESIDUE

- D6 reset: both run requirements archived and purged through `DELETE …?qa_run_id=qar_af1c638fd52a`
  (`document_requirement_purge`: 3 versions + 0 waivers, 1 version + 1 waiver), the quarantined upload POS-deleted, the
  household removed by lead deletion; every requirement, document and the household library 404 (`all_gone: true`).
- D5 reset (all gone), D4 reset (household and orphaned guardian), D1b lead deletion and teardown, Q1, D2, D3 teardowns.
- Registered resets `gar_7a7d053ac793d5`, `gar_341f57f968ff69`, `gar_05735f05af9431`.
- Close `gar_ac198181b7143c` (17:18:00Z): **ZERO_RESIDUE**, access clean, 7/7 sessions signed out, 0 custom-role grants.
- Census: the D6-extended census (`eb702fb6…`, `gar_53d6744eb1cf1a`) **15/15 zero** including `doc_zr_d6_requirements`,
  `doc_zr_d6_requirement_versions`, `doc_zr_d6_waivers` (`d6_zero_residue_extended_census.qar_af1c638fd52a.json`).
  Binding it was refused (`qa_residue_census_rejected`): the authz_q1 plan's registered census is hash-pinned to the
  pre-D6 file (`3be83854…`). The registered census was run on that exact content (`gar_36a8179c88d9bc`, 12/12 zero) and
  bound by `gar_dc0e6f3915ff4c` (`documents-zero-residue-census.sql.results.json`). **Gap for the toolkit owner:** the
  registered residue census does not include D6's requirement checks; until its pin moves to `eb702fb6…`, a bound
  ZERO_RESIDUE does not by itself prove zero requirement residue (this run proved it separately).

#### Sprint

`OPWORK_AA660DC9554D_SPRINT_362F6FBDCB83` reads PROMOTED, `next: evidence each completion condition`. The conditions
could not be evidenced from this session: run `erun2_a8cdd83d5836194a` is attributed to no objective
(`vac sprint condition … run_not_attributed`), and attribution is the Director's (a run dispatched for the objective).
Evidence for each condition: c1 authoring + applicability (D6 driver §1–3, §10–11); c2 evaluator transitions (§4–8);
c3 waivers (§7); c4 Processing / Work Items / Focus Panel parity (driver §4–6, browser W1–W4, W6; Focus Panel by API);
c5 Business Process readiness (local: `tests/documents/documentsD6BusinessProcess.test.ts`; not separately exercised on
staging — no Business Process stage requirement names a document type in QA Shared); c6 isolation (§9, §6 clearance);
c7 regressions Q1 90, D1b 37, D2 40, D3 40, D4 41, D5 59, browser walk, ZERO_RESIDUE (above).

## Status

D6 hosted certification on the deployed build `1492a2dd`: **D6 73/74** (one recorded defect, repaired in D7, not
deployed), all regressions green, browser walk 5/8 (Focus Panel readiness reached by API only), ZERO_RESIDUE bound.
Sprint closure awaits the Director's attribution of a run to `OPWORK_AA660DC9554D_SPRINT_362F6FBDCB83`.
