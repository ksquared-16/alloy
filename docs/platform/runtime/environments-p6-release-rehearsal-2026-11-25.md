---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P6 routine release path and its non-live rehearsal (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P6. Builds on
[P1](environments-p1-production-census-2026-11-25.md)–[P4](environments-p4-rebuild-and-integration-rehearsal-2026-11-25.md).
The procedure is [`production-release-procedure.md`](../governance/production-release-procedure.md), and the tooling is
[`scripts/release/`](../../../scripts/release/). Evidence is in [`environments-p6-evidence-2026-11-25/`](environments-p6-evidence-2026-11-25/), with its checksums in
[`environments-p6-evidence-2026-11-25.sha256`](environments-p6-evidence-2026-11-25.sha256).
Rehearsal run window: 2026-11-26 01:27:12–01:27:41 UTC (2026-11-25 local, `rehearsal/run-window.txt`).

**P5 is not recorded in this repository.** This slice depends on it, but no P5 record or commit exists on this branch. P6
therefore defines the *routine* path, and states (below) where the first promotion still has to come from.

## Outcome in one paragraph

The staging-to-production release is now ten ordered steps, written as code and documented. The three hard gates are
staging verification, an owner approval bound to the manifest hash, and production verification. Schema changes are ordered: additive before the
deploy, destructive after it. The procedure has a snapshot rollback point, a code rollback, and a hash-chained audit log. The same `prepare`/`execute`
sequence and the same check functions ran in a **non-live rehearsal**: 17 end-to-end scenarios against a throwaway,
network-less database, a local bare repository and a loopback build-info server, all passing (`17/17`). A further 24 offline tests cover each
control and the owner-facing CLI (`24/24`). Run read-only against this repository's real refs, the tool reaches P4's
conclusions on its own. Staging does not fast-forward `main` (7 main-only commits). The P4 candidate does. Its schema plan is
**blocked** because production's ledger is unknown, and, under the hypothesis that production equals main, it is blocked again by 21 named
reasons: P4's three version collisions, the two migrations edited in place, the three renumbered copies, 12 out-of-order files and one
destructive-before-additive ordering. **No production or staging system was accessed. Nothing was pushed or deployed, and no credential was used.**

## What was built

| File | Role |
|---|---|
| `scripts/release/release-lib.mjs` | Every control as a pure function over observations: candidate identification (it reuses `scripts/migration-preflight.mjs`'s `checkMigrationRepo` on the candidate's tree), expand/contract classification, the ordered schema plan, staging and production checks, ALY-14 tenancy checks, manifest and approval binding, the audit chain, and the rehearsal fence |
| `scripts/release/release-runner.mjs` | The order: `prepare` (steps 1–3) and `execute` (4–10, with `code.rollback`). The approval is re-verified, with that step's scope, before **every** production step |
| `scripts/release/release-rehearsal.mjs` | Non-live stand-ins: a throwaway Postgres, a bare-repo compare-and-swap deploy, a loopback "Vercel" with Instant Rollback semantics, and a fixture repository |
| `scripts/release/alloy-release.mjs` | The owner's CLI: `identify`, `plan`, `prepare`, `approve`, `check-ledger`, `emit-apply`, `check-production`, `record`, `runbook`, `verify-audit`, `rehearse` |
| `scripts/release/release-config.json` | Environment identities (from `deployment-and-environments.md`), owners, the 24 h approval cap, required checks, and the ALY-14 tenancy policy (Firefly `93667019-…`, ZZ Alloy QA `4acc9386-…` / `ad53fee2-…`, seed prefix `f17e0000-0000-4000-8000-`, `_w17_selftest_`) |
| `scripts/release/tests/release-procedure.test.mjs` | 24 offline tests |
| `scripts/release/tests/release-rehearsal.test.mjs` | 17 rehearsal scenarios (Docker) |
| `package.json` | `release`, `test:release-procedure`, `test:release-rehearsal` |

## Rehearsal: each control, and the scenario that exercises it

Stand-ins only. Staging and production were two databases (`p6_staging_*`, `p6_production_*`) in one `postgres:17-alpine`
container started with `--network none`, data on tmpfs, label `alloy.purpose=p6-release-rehearsal`, reached only by `docker exec`.
The shared `alloy-cert` stack was not used, and `supabase` was never invoked. The project refs were invented (`rehearsalstagingref0`,
`rehearsalproductionrf`). The rehearsal approver was "Rehearsal Owner", in environment `rehearsal`, so no approval made here can authorize
production (offline test *approval: every way it can be wrong*). Afterwards no labelled container and no fixture repository remained
(`rehearsal/teardown.txt`).

| Control | Scenario (`rehearsal/<name>.audit.jsonl`) | Result |
|---|---|---|
| All ten steps, in order | `happy` | Released. Production ledger = staging's 4 versions. Production serves the candidate, `main` = candidate, and the production fingerprint equals staging's. The audit chain verifies (12 entries) |
| Rollback point | `happy` | The step-5 dump (`sha256 9eea…` in the audit) restored into a fresh database reproduces the pre-release fingerprint and ledger exactly |
| Staging verification: CI | `staging_ci_red` | `trust-db-certification` red on the candidate → stops at `staging.verify`, no manifest, nothing to approve |
| Staging verification: ALY-14 | `staging_extra_tenant`, `staging_no_firefly` | A second school on staging fails, and so does staging without Firefly |
| Candidate identification | offline `identify:` test, and the real-refs run below | Diverged `main`, an extra tree path and a migration edit are each refused |
| Ordered schema plan | `ledger_orphan`, `contract_not_last`, plus offline plan tests | A production version with no file is refused (C1). A destructive migration before an additive one is refused |
| Owner approval | `no_approval`, `expired_approval`, `stale_approval` | Each stops at `owner.approval` **before the snapshot**. Ledger, served build and `main` are unchanged |
| Approval scope | `contract_without_scope` | The release goes live, and the destructive migration is held (`does not grant schema_contract`) |
| Ordered apply, transactional | `migration_failure` | A real `division by zero` inside the second file's transaction. The first file stays applied, and the second file's `CREATE INDEX` and ledger row are both rolled back (asserted). The deploy is not attempted, and the old build serves |
| Drift after approval | `ledger_drift` | A version applied to production after approval → `schema.expand` refuses before applying anything |
| Deploy compare-and-swap | `main_moved` | An unapproved commit lands on `main` → `code.deploy` refuses and leaves it in place |
| Production checks → code rollback | `verify_fail_rollback` | The deploy keeps serving the old build → `production.verify` fails → Instant-Rollback stand-in → the previous build is served again (`code.rollback:pass`) |
| Production checks: ALY-14 | `production_tenant_leak` | A ZZ Alloy QA org in production fails verification and rolls back |
| Contract after deploy | `contract_release` | `schema.contract:applied` comes after `code.deploy:pass` and `production.verify:pass`. The final fingerprint equals staging's |
| Audit evidence | all 16 audit files | `verify-audit` ok for each (`rehearsal/audit-verification.txt`). Offline: an edit, a deletion or a reorder each fail |

The owner-facing live path (`prepare` over evidence files → `runbook` → `check-ledger` → `emit-apply` → `record`, which is refused without an
approval → `check-production`) is exercised end to end over a fixture by the offline test *live evidence path through the CLI*.
`sample-runbook-from-rehearsal-manifest.txt` is the runbook printed for the `contract_release` manifest.

## Real refs, read-only (`real-refs/`)

Refs as last fetched (not re-fetched, `real-refs/refs.txt`): `origin/staging` `8321949771f7`, `origin/main` `bbfbec76d779`,
P4 candidate `ea06c21f3401`.

| Command | Exit | Result |
|---|---|---|
| `identify --staging origin/staging --main origin/main` | 1 | `main has 7 commit(s) the candidate lacks`. That is P4's seven, so staging cannot be released routinely until it is integrated |
| `identify … --candidate refs/candidates/aly-14-p4-staging-to-main --allow-tree-diff .github/workflows/vacilando-tier2.yml` | 0 | Fast-forward. The tree differs from staging's only in that file. 557 migrations; the C1 preflight passes |
| `plan … --production-ledger unknown` | 1 | `production_ledger_unknown` (P2 could not read it) |
| `plan … --production-ledger baseline` (**hypothesis**: production's ledger = main's versions) | 1 | 332 pending (312 expand, 20 contract). 21 blockers: `baseline_collision` ×3 (`20260630120000`, `…130000`, `20260707120000`), `changed_in_place` ×2 (the two P4 named), `renumbered_duplicate` ×3, `out_of_order` ×12, `contract_not_last` ×1 (`20260702000002_commercial_tuition_rates_v2`). 48 C4 idempotency warnings |

So the first promotion cannot go through the routine path as it stands, and the tool says exactly why. That work
(P4 O6, and P5 if that is its scope) has to read production's ledger, bring production to the staging schema, and decide on the
Vercel Cron (P4 H2). After that, production's ledger equals main's chain, and each later release is a short pending list
through this procedure.

## Checks run

| Check | Outcome |
|---|---|
| `node --test scripts/release/tests/release-procedure.test.mjs` | **24 pass / 0 fail**, exit 0 (`node-test-release-procedure.log`) |
| `node scripts/release/alloy-release.mjs rehearse --out-dir …/rehearsal` (`node --test …/release-rehearsal.test.mjs`) | **17 pass / 0 fail**, exit 0, ~29 s (`rehearsal/node-test-release-rehearsal.log`) |
| Mutation checks (not kept): disabling the expiry check, and the approval gate in `execute` | Each turned a test red (`expired` offline; `no owner approval` rehearsal) |
| Real-refs `identify` / `plan` | recorded above |
| `web` lint/typecheck/vitest | not run: no `web/` file changed |

## Owner actions and operational prerequisites remaining

1. **Adopt or amend** [`production-release-procedure.md`](../governance/production-release-procedure.md) (status `proposed`).
2. **First promotion first** (above). Read production's ledger read-only, including the `statements` of the three colliding versions, and complete P4 O6.
3. **Bind approval to identity.** Today `approve` proves only that the approval was given at a terminal, outside an agent session. Choose a binding, for example the owner's GitHub
   review on the candidate PR, or a signed tag, before relying on it.
4. **Confirm `required_checks`** against the real check-run names on a `staging` commit. They are P4's workflow names, and check-run names are job names.
5. **Production read-only credential.** The runbook's observations use `$PRODUCTION_DB_URL_READONLY`. A read-only role on production
   does not exist in any record here. Applies use the session pooler (5432), not 6543 (migration controls).
6. **Backups.** Confirm the production project's backup / PITR tier, which step 5 relies on alongside `pg_dump`.
7. **Vercel.** Confirm Instant Rollback is available on the plan, and who may use it. The production cron decision is P4 H2. Set the vault
   `scheduled_work_wake_url` before the wake credential (P4 F7/O5).
8. **Release record home.** Decide where release directories are committed (proposed: `releases/<date>-<sha12>/`).

## What was not done

- No production or staging access of any kind, no push, PR, merge, deploy or fetch, and no credential.
- No live release, so the runbook's live commands have not run. The rehearsal ran their logic and their SQL (`wrapMigrationForApply`, the
  fingerprint, ledger and org queries) against stand-ins.
- No migration was written, and no change was made to the app.
