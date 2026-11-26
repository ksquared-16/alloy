# Documents V1 — D7 Review, Expiration and Renewal Management

Director instruction: **Documents V1 batched execution model — D6 hosted certification → D7 + D8 local development**
(2026-10-27). Batch sprint `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A` (established by `gar_c12264400acc8c`, hold HELD),
lane `lane_aa660dc9554d`, branch `agent/documents`. **Local development only: not pushed, not merged, migration not
applied to any shared environment.**

## Starting position

| | |
|---|---|
| Base | the certified D6 code: `agent/documents` at `13591aa9d` contains `dfa2fc798` (the D6 candidate) and is tree-identical to staging `1492a2dd` for every non-evidence path (`git diff dfa2fc798 origin/staging` empty) |
| Staging ledger head | `20261212090000`; D7 is `20261213090000` (no branch carries a later migration, measured across every `origin/*` ref) |
| Reconciliation | `repository.integrate_base` (`gar_124d53c257dc6d`) was refused `lane_run_active` — it runs only from a run yielded on that request. Staging carries no content the branch lacks; the ancestry merge is outstanding (see the batch record) |

## D7.1 — validity and expiration authority

| Concern | Where |
|---|---|
| The policy | D3's published `validity_policy` (organization configuration), now carried on `PublishedDocumentTypePolicy` |
| The facts | `document_versions.effective_on` / `expires_on` (D2's only mutable fields, with review) |
| The evaluator | `web/lib/documents/validity/documentValidity.ts` — pure, no clock |
| The clock | `web/lib/documents/validity/documentsClock.ts` — the organization-local date (`org_settings.metadata.timezone`, UTC only when none); **D6 used the UTC date**, one day ahead of a Pacific organization every evening — replaced for every Documents consumer |
| Writing dates | `GET/PUT /api/admin/documents/[id]/validity` → `document_set_version_validity` (current version, available documents, `effective_on <= expires_on`, review untouched, appended to the review history); `document_version_validity_set` audited first |

Rules: `expires_on` is the last valid day; expiring soon is the largest `warning_days` window, inclusive; durations and
reconfirmations derive `anchor + value·unit − 1 day` (month-end and leap-day clamped), a recorded date overrides;
explicit-date and event types need a recorded date (`date_missing`); before `effective_on` a document is not in force.

Requirement impact (the D6 evaluator, `documentRequirementEvaluator.ts`): accepted evidence that is expired or not yet
in force no longer satisfies → new state **expired** (blocking); accepted evidence missing a required date → *pending
review* (`evidence.undated`); satisfied evidence reports `valid_until` and `expiring_soon`. Business Process readiness
consumes the same evaluation (`projectDocumentRequirementProgress`, reason "has expired").

## D7.2 — review lifecycle

`POST /api/admin/documents/[id]/review` (the D6 endpoint, reused) → `document_review_version`:

| | Authority | Reason |
|---|---|---|
| first decision (pending / never reviewed → accepted / rejected) | `documents.write` + the full access decision | required to reject |
| reopen (→ pending) | `processing.documents.manage` (it changes a decision) | required |
| re-review (accepted ↔ rejected) | `processing.documents.manage`, else 403 `REREVIEW_NOT_AUTHORIZED` | required |

Current version only (409 `NOT_CURRENT_VERSION`); never an unavailable document. Every decision is a row of
`document_version_review_events` (reviewer, decision, reason, prior state); the history renders each one
("Review accepted (was rejected) — reason"). **This repairs the D6 hosted finding** (qar_af1c638fd52a: history showed
only the latest decision). Review-required policies are the D5 ones (type `review_required`), plus D3's
`review_on_renewal` for renewals.

## D7.3 — renewal and replacement

Renewal is a replacement version (`POST /api/admin/documents/[id]/versions`): same document, same canonical subject and
associations, earlier versions and audit kept, optional `effective_on` / `expires_on` recorded on the new version. The
new version is pending review when the type requires review or `review_on_renewal`. Until it is accepted it satisfies
nothing; the earlier accepted version keeps counting while still in force (`prior_accepted`), and once it lapses a
rejected renewal blocks (`evidence_rejected`). A file screening would quarantine is refused before storage (D2), so a
quarantined replacement can never satisfy a requirement; a quarantined document never satisfies whatever its history.
"Documents requiring renewal" are the expiring/expired rows of D7.4.

## D7.4 — operational surfaces

One derived read, `GET /api/admin/documents/requirements/work` (no stored queue, no `operational_tasks`):
- `rows`: D6 requirement work plus **expired**, and **expiring soon** renewal work (due on the evidence's last valid day,
  never overdue, never blocking);
- `documents` (`documentAttention.ts`): owned, available documents of tracked types that are **expired**, **expiring
  soon**, **review due** or **date missing** — excluding any document a requirement row already names (no duplicates);
  disclosed per actor (scope, then sensitivity) before listing.

Processing → Work → Documents → Missing documents shows five requirement states and a "Document attention" filter; Work
Items maps both kinds (`mapDocumentAttentionToWorkItemRow`, source Documents, reasons per kind); the Focus Panel
readiness card shows expired / expiring counts and each requirement's valid-through date; the library shows each
document's server-derived validity with review (accept, reject, reopen/re-review with reason), date and renewal controls.

## D7.5 — local certification

| Evidence | Result |
|---|---|
| `tests/documents/documentsD7ReviewValidity.test.ts` | **34/34** — date boundaries, warning windows, derived durations (month-end, leap day), not-yet-effective, missing dates; the organization date after UTC midnight (America/Los_Angeles); policy kinds; expired / expiring / undated / renewal-pending / rejected renewal / quarantine / waiver outcomes; readiness, work and attention parity and de-duplication; clearance; Work Items; review lifecycle and authority; validity route refusals; renewal end to end |
| Mutation | disabling validity in the evaluator fails 10 of the 34 |
| Postgres invariants `certification/invariants/documents-d7-review-validity.sql` | **10/10** on the shared local stack, D2 → D8 applied in ONE rolled-back transaction, D7 applied twice; nothing persisted (`document_version_review_events` absent afterwards); a mutation removing the re-review guard fails invariant 2 |
| `tests/documents` | 491/491 (with D8) — D6 / D3 / Studio tests updated where D7 deliberately changed behaviour (the review writer, the Studio validity label, the enforcement vocabulary) |
| Typecheck | `vac run typecheck`, `vac run typecheck:tests`: green |
| Prebuild guards | all six pass (the new validity route declared) |

Batch-level regressions, build and Human-QA are in `DOCUMENTS-D7-D8-BATCH.md`.

## Commits

`55de2194e` slice 1 (validity, review lifecycle, migration) · `fbc06f18e` slice 2 (renewal) · `ccd26ad58` slice 3
(projections and surfaces) · `0a23d47e8` slice 4 (local certification).

## Status

**Locally certified, not promoted.** Not hosted-certified; migration `20261213090000` not applied to staging.
