# Processing Identity Resolution V1 — Promotion Checklist

**Status:** Implemented locally · Locally certified · Reconciled onto latest `origin/staging` · Awaiting PR merge to staging · Not deployed.

## Before rebase

- [ ] Confirm branch is `claude/proc-identity-lib-normalization`.
- [ ] Confirm closeout HEAD matches this report and working tree is clean.
- [ ] Preserve the local certification report, commit inventory, and cert cleanup log.
- [ ] Confirm no local secrets, `.env.local`, credentials, database volumes, or test artifacts are tracked.
- [ ] Record current staging SHA only when the staging-reconciliation engagement begins.
- [ ] Confirm rollback owner, migration operator, staging tester, and production approver.
- [ ] Confirm `IdentityResolutionEligibility` remains fail-closed (no flag bypass restored).

## Rebase onto latest staging

- [ ] Fetch latest staging only after explicit authorization.
- [ ] Create a safety reference before rebase.
- [ ] Rebase the complete unsquashed sprint history onto latest `origin/staging`.
- [ ] Do not silently drop migration, security, source-cutover, direct-write-retirement, test, or documentation commits.
- [ ] Record pre/post rebase SHAs.

## Resolve conflicts

- [ ] Preserve one authoritative D4 Create Lead adapter.
- [ ] Preserve one authoritative D5 public-form adapter.
- [ ] Keep `applyFormIntakeSafe` throw-only and remove any restored replay argument.
- [ ] Preserve registered command keys and plan operation contracts.
- [ ] Preserve approval hash/version binding and stale-plan checks.
- [ ] Preserve atomic identity-group RPC semantics and `customer_persons` conflict target fix.
- [ ] Preserve org-scoped RLS and the non-recursive `has_org_role` implementation.
- [ ] Reconcile new staging migrations chronologically; never renumber already shared migrations without review.
- [ ] Reconcile canonical docs to final integrated behavior.

## Replay migrations locally

- [ ] Run workspace doctor and confirm no competing local Supabase/TypeScript process.
- [ ] Start/reset an isolated Supabase stack.
- [ ] Replay the complete reconciled migration history from empty state.
- [ ] Confirm all Processing tables, constraints, indexes, policies, functions, and triggers exist.
- [ ] Run duplicate-name checks for indexes, policies, functions, and triggers.
- [ ] Verify no destructive data operation was introduced during conflict resolution.
- [ ] Export schema CSV references from this reconciled local database.
- [ ] Regenerate `docs/schema/*.md`; inspect changes and commit only reconciled truth.

## Re-run certification

- [ ] `npm run cert:processing-identity-full`
- [ ] Confirm all 17 database checks pass.
- [ ] Confirm authenticated JWT org/role RLS matrix passes.
- [ ] Confirm D4/D5 integration and target guard pass.
- [ ] Confirm executor atomic rollback, retry, stale plan, and compensation pass.
- [ ] Confirm no test requires a production runtime flag/toggle.

## Run regression

- [ ] Execute every automated item in `processing-identity-resolution-regression-checklist.md`.
- [ ] Run focused identity, forms intake, Create Lead, commands, Processing, mutation, workflow, and security suites.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:tests`.
- [ ] Run `npm run lint` or record pre-existing/non-sprint findings.
- [ ] Run production build.
- [ ] Run full test suite when practical; otherwise record exact scoped suite and rationale.

## Push

- [ ] Confirm integrated branch is clean and all closeout commits remain coherent.
- [ ] Push only after explicit authorization.
- [ ] Do not force-push staging/main.
- [ ] If the feature branch history was rebased, obtain explicit approval for any required safe force-with-lease update.

## Open PR

- [ ] Base the PR on `staging`.
- [ ] Use `processing-identity-resolution-release-notes.md` as the PR body foundation.
- [ ] Link migration summary, rollback plan, regression checklist, and certification evidence.
- [ ] State clearly: not deployed; no production migration applied.
- [ ] Request review from Processing, identity/entity, forms, security/RLS, and migration owners.

## CI expectations

- [ ] Production typecheck passes.
- [ ] Test typecheck passes.
- [ ] Production build passes.
- [ ] Processing/identity/forms/commands tests pass.
- [ ] Migration replay/schema validation passes.
- [ ] No module-import, secret-scan, lint, or generated-artifact drift.
- [ ] Any failure is triaged against the reconciled branch, not dismissed as a prior baseline.

## Manual staging validation

- [ ] New-family Create Lead: case opens, no identity writes, review/approve/commit creates expected graph.
- [ ] Existing parent/new child: reuses person/household and creates only intended child/lead records.
- [ ] Existing child/new interest: no duplicate child.
- [ ] Shared email/phone: review required; no wrong-person auto-link.
- [ ] Child name + conflicting DOB: plan blocked until operator resolves.
- [ ] Public form submit: success response, Processing Case created, CRM FKs null before commit.
- [ ] Plan revision invalidates prior approval.
- [ ] Duplicate execute/retry does not duplicate records.
- [ ] Cross-org user cannot read/modify another org's Processing or identity rows.
- [ ] Staff cannot perform privileged resolution/approval/execution writes.
- [ ] Digital Mailroom review and Create Lead surfaces show operator-safe errors and final state.

## Smoke tests

- [ ] Browser: Create Lead intake → Digital Mailroom review → explicit commit.
- [ ] Browser: public form submit → admin case review → explicit commit.
- [ ] API: case review, correction, resolution, plan, approve, execute.
- [ ] API: duplicate/replayed source returns existing case.
- [ ] API: stale plan and wrong-org attempts fail closed.
- [ ] Database: expected attempt/exception/audit rows present.
- [ ] No client request contains service-role credentials.

## Rollback plan

- [ ] Confirm `processing-identity-resolution-rollback-plan.md` against the reconciled migration graph.
- [ ] Know how to disable executor/operator/source entry points by deployment rollback.
- [ ] Preserve cases, facts, plans, approvals, attempts, and exceptions for audit.
- [ ] Confirm replayed sources will reuse source keys and not create duplicate cases.
- [ ] Confirm no rollback depends on restoring dual writers.

## Production promotion prerequisites

- [ ] Staging reconciliation and all certification/regression gates complete.
- [ ] PR approved and merged to staging.
- [ ] Staging migration apply and smoke complete.
- [ ] Observation period accepted by product/operations/security owners.
- [ ] Production backup/restore point and migration operator confirmed.
- [ ] Production rollback owner and communication plan confirmed.
- [ ] Production migration window approved.
- [ ] No unresolved high-severity identity, RLS, executor, or direct-write-authority defect.
