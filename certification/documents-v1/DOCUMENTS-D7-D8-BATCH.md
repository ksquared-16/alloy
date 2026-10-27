# Documents V1 — D7 + D8 local batch: integration evidence and Director review package

**Status: `DOCUMENTS_V1_D7_D8_LOCAL_BATCH_READY_FOR_DIRECTOR_REVIEW`** — local development readiness only. Not pushed,
not merged, not deployed, not hosted-certified; migrations `20261213090000` (D7) and `20261214090000` (D8) applied to no
shared environment. D9 and D10 not started.

Candidate: `agent/documents` at the commit carrying this record (code identical to `22103ecb6`; records only after it).
Batch sprint `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A` (hold HELD).

## Integration evidence (candidate `22103ecb6`)

| Gate | Result |
|---|---|
| Affected sweep: `tests/documents forms publicForms enrollment lifecycle businessProcesses workItems pos processing focusPanel health` + 17 importers of changed modules | 7,707 tests: 7,421 pass, 142 fail, 141 skipped. **0 new reds**: the same 142 fail (65 files) on the D7-free base `bb48aec0a` (temporary worktree, same files, same runner) |
| Documents suite | 491/491 (26 files) |
| D7 / D8 suites | 34/34, 12/12 (mutations: evaluator validity off → 10 fail) |
| Postgres invariants | D7 10/10 + D8 7/7 — `certification/invariants/run-d7-d8-local.sh`: D2 → D8 applied in ONE rolled-back transaction on the shared local stack (alloy-cert, leased), D7 and D8 each applied twice (re-runnable); nothing persisted. Mutations: re-review guard removed → invariant 2 fails; `form_evidence` dropped from the version guard → invariant 6 fails |
| Migration order / ledger | staging ledger head `20261212090000` (unchanged at staging `6376564d3`); D7 `20261213090000` and D8 `20261214090000` sort after it; no `origin/*` branch carries a migration after `20261212090000` (all refs measured) |
| Typecheck | `vac run typecheck`, `vac run typecheck:tests`: green |
| Prebuild guards | verify:module-imports, service-client principal, unauthenticated side effects, route capabilities, runtime-mode audience, governed documents: all pass |
| **Production build** | `vac run build` on `22103ecb6`: **rc=0**, compiled; `/api/admin/documents/[id]/validity` in the route manifest |
| Merge with current staging | `git merge-tree HEAD origin/staging` (`6376564d3`, two docs-only PRs since D6): clean |

## Security, tenant scope, sensitivity, audit, authorization (review)

- New writers are SECURITY DEFINER, service-role only, with RLS on the new table and no client grants (self-verified
  by each migration; invariant D7-10).
- Review: first decision `documents.write` + full access decision; re-review/reopen `processing.documents.manage` +
  reason; current version only; unavailable documents refused twice (route access decision, database). A race between
  the route's read and the write fails closed (`document_review_already_decided` → 409).
- Validity: `documents.write` + access decision; current version; available only; server-side organization date.
- Projections: organization-bound reads; subject scope then sensitivity clearance before listing or counting; medical
  requirements invisible to an actor without `health.view` (tested); quarantined documents never listed. An attention row
  names the owner of a document whose entity is in the actor's scope — the D4 library's disclosure, unchanged.
- Forms evidence: never accepted by default; mismatched signed artifacts, drafts, voids, signatures never count; the
  policy is database-validated and immutable once published.
- Audit: `document_version_reviewed` (now with `rereview`), `document_version_validity_set` recorded before every write;
  every decision and date change also in the append-only review history.
- Cross-organization: 404 on review, validity, readiness (tested).

## Architectural decisions

1. **Validity derived, never stored** — one evaluator, one organization clock; no status column, no cron.
2. **Organization-local date** replaces D6's UTC date for every Documents evaluation (latent D6 boundary defect).
3. **Append-only review history** rather than widening the version row (the version holds the latest decision; the
   history holds all). Repairs the D6 hosted finding.
4. **Renewal = replacement version**; an earlier accepted, in-force version keeps satisfying while a renewal awaits review.
5. **One work read** for requirement work and document attention, de-duplicated server-side.
6. **Forms: provenance by reading existing links**, not a new store; a signed artifact stays a distinct document (legal
   artifact integrity) rather than a version of the completed PDF.
7. **Forms evidence is requirement policy** (versioned, validated, immutable), default "needs review".

## Known defects and risks

- **Browser path to a child's Documents card** (D6 hosted walk): "Open the record's documents" on a child row lands on
  QA Shared's published child surface, which has no Documents card. D7 does not change the published surfaces; needs a
  Human-QA / surfaces decision.
- **Registered residue census pin**: the authz_q1 plan's registered ZERO_RESIDUE census is hash-pinned to the pre-D6
  file; D6/D7/D8 residue (requirements, versions, waivers, review events) is proven only by the extended census until the
  toolkit registry moves the pin (`eb702fb6…`). D7's review events cascade with documents, so they cannot outlive a
  deleted fixture.
- `event_renewal` validity cannot yet resolve its event dates from the record (enrollment start, program year, birthday);
  such documents need a recorded expiration date (shown as "date missing").
- The document-attention population is the 1,000 newest documents of tracked types (truncation flagged); a very large
  organization needs pagination before hosted scale-up.
- Pre-existing reds: 142 in the swept suites, all present on the base (not introduced here).
- Not exercised on staging: everything D7/D8 (by design); Business Process readiness with document stage requirements
  (no QA Shared process names a document type).

## Human-QA walkthrough (on the deployed build, after an authorized promotion)

Setup: a QA run (authz_q1); a run-scoped household with two children; a run-scoped requirement `qa_<run>_imm` for
Immunization record (child, required, waivable); a form definition the requirement names as Forms evidence.

1. **Studio → Documents → Requirements**: open the requirement; the Validity note reads "Enforced — an expired document no
   longer satisfies a requirement"; tick "Also satisfied by completed forms" for the form, keep "needs a review";
   validate, publish.
2. **Focus Panel → Documents** (case Focus Panel, Activity → Documents): readiness shows the requirement missing for both
   children.
3. Upload an immunization record for child 1; it shows **Pending review**. Reject it without a reason (refused), with a
   reason (Blocked). As a non-administrator try to accept it: refused ("needs Documents administration"). As an
   administrator accept it with a reason: Satisfied. Expand the row: the history lists "Review rejected — reason" and
   "Review accepted (was rejected) — reason".
4. In the row's Validity section record an expiration within 30 days: the readiness row reads "Expiring soon · valid
   through …"; Processing → Work → Documents shows an **Expiring soon** row due that day; Work Items shows "Renew: …".
5. Record an expiration in the past: readiness **Expired**, work row **Expired**; Business Process readiness (if a stage
   names the type) shows the requirement outstanding "has expired".
6. Renew: "Renew: upload the new version" with new dates and a reason → v2, Pending review; the requirement stays
   Satisfied by v1 if v1 is still in force ("renewal awaiting review"); accept v2 → valid through the new date.
7. Upload a scripted PDF as a replacement: refused, nothing stored; the requirement is unchanged.
8. Child 2: submit the named form; its completed PDF appears in the library as "Completed form: <form>" and the
   requirement reads Pending review (not Satisfied); accept it → Satisfied. A signed artifact shows "signature integrity
   verified".
9. Processing → Work → Documents → **Document attention**: a driver's license (explicit-date type) accepted without a date
   shows "Date missing"; recording its date removes the row.
10. As a reader without `health.view`: no medical requirement, no medical attention row, no medical document listed.
11. Timezone: with the organization's zone set to America/Los_Angeles, after 17:00 local a document expiring "today" is
    still valid.
12. Teardown through the run's routes (purge by `qa_run_id`, lead deletion), close, ZERO_RESIDUE (extended census).

## Ready for governed promotion?

The code is ready for a **Director decision**, not for automatic promotion. Required before a release:
the Director's attribution of a run to the batch sprint so its slices and checkpoint can be registered (see below), one
checkpoint on the exact candidate, a release, CI, a protected merge, the Supabase integration applying `20261213090000`
then `20261214090000` (or governed applies), hosted certification of D7/D8 and the D6–D8 regressions, ZERO_RESIDUE.

## Exact remaining approval requests (none filed for promotion)

1. **Attribute a run to `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A`** (and one to `…_362F6FBDCB83` for D6 closure):
   `vac sprint commit-slice / checkpoint / condition` refuse `run_not_attributed` for `erun2_a8cdd83d5836194a`.
2. **D6 sprint closure**: evidence conditions c1–c7 (record above, `D6-DOCUMENT-REQUIREMENTS.md`) and close
   `OPWORK_AA660DC9554D_SPRINT_362F6FBDCB83` through the Director lifecycle.
3. **Base reconciliation** `repository.integrate_base` onto current staging (`6376564d3`; docs only, clean merge) — filed
   as `gar_124d53c257dc6d`, refused `lane_run_active`; it must be re-filed from a run that yields on it.
4. On a separate promotion instruction only: slices d7-s1…s4, d8-s1…s4 → checkpoint → `vac sprint request-release` →
   governed PR → CI → merge → migrations → hosted D7/D8 certification.
5. Toolkit owner (not this lane): move the authz_q1 registered residue census pin to `eb702fb6…`.
