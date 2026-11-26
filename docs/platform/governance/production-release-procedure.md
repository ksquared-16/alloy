---
owner: platform
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Proposed by objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (slice P6). Rehearsed non-live only; not yet used for a production release.
---

# Staging-to-production release procedure

The routine path by which a commit that staging has verified becomes what production serves. It has ten ordered
steps. Three of them are hard gates: **staging verification**, the **owner's approval**, and **production
verification**. Every step leaves a hash-chained audit entry.

Tooling: [`scripts/release/`](../../../scripts/release/) (`npm run release -- <command>`). Rehearsal record:
[`environments-p6-release-rehearsal-2026-11-25.md`](../runtime/environments-p6-release-rehearsal-2026-11-25.md).

## Ground rules

- **Production releases need the owner's explicit approval.** The approval is a record bound to one manifest: the candidate
  SHA, the main SHA it replaces, the exact pending migrations, and the staging verification. A change to any of these voids it.
  It expires in at most 24 h (4 h by default). Only the owners listed in `scripts/release/release-config.json`
  (`owners`) can give it. `alloy-release approve` refuses to record a production approval from an agent session or
  without a terminal.
- **The release tool never connects to staging or production and never holds a credential.** Live observations are files the owner
  produces with the read-only commands the runbook prints. The owner performs every live action. The tool identifies the candidate,
  plans the schema change, checks the evidence, binds the approval, and keeps the audit chain.
- **Production receives only what staging ran.** That means the same tree, apart from paths named explicitly at identification
  (P4's one workflow file), the same migration files, and the migration versions staging's ledger records.
- **ALY-14 tenancy.** Firefly is the only staging school. ZZ Alloy QA exists on staging only for the existing cross-organization
  and permission fixtures. Neither the ZZ Alloy QA orgs, nor any row in the staging-seed namespace (`f17e0000-0000-4000-8000-…`), nor an
  unretired `_w17_selftest_` org may appear in production.
- **Migrations are applied only from committed repository files** ([migration controls](migration-promotion-controls.md) C2). They are applied
  in version order, one transaction per file together with its ledger row, for exactly the versions approved.
  The procedure does not use `supabase db push` itself, because push applies whatever it finds pending, not what was approved.
- **Additive first, destructive last.** Additive (*expand*) migrations run before the new code, so the old build still works
  against them. Destructive (*contract*) migrations run only after the new code is live and verified, and need their own approval
  scope.

## Roles

| Role | Who | Does |
|---|---|---|
| Owner | listed in `release-config.json` `owners` (Kelly) | approves, runs every production command, holds every production credential |
| Developer (agent or human) | anyone | prepares the candidate, runs the rehearsal, may run `identify` / `plan` / `prepare` over evidence files the owner supplies |

## The procedure

`<dir>` is a release directory, for example `releases/<date>-<sha12>/`. Every observation file, the manifest, the approval and
`audit.jsonl` live in it. It is committed afterwards as the release's evidence.

| # | Step | Control | How | Stops when |
|---|---|---|---|---|
| 1 | `candidate.identify` | **Candidate identification** | `release identify --staging origin/staging --main origin/main [--candidate <sha> --allow-tree-diff <path>]` (git objects only) | `main` does not fast-forward to the candidate; the candidate's tree differs from staging's outside the named paths; any migration differs from staging's; the repository's migration preflight (C1) fails on the candidate tree |
| 2 | `staging.verify` | **Staging verification** | owner collects: staging `/api/build-info`, CI check-runs for the candidate SHA (`gh api repos/ksquared-16/alloy/commits/<sha>/check-runs`), staging ledger, fingerprint and org listing (read-only SQL, printed by `release runbook`) | staging is not serving the candidate, or is wired to the wrong Supabase project; any `required_checks` entry is missing or not `success` **on the candidate SHA**; staging's ledger is not exactly the candidate's migration set; the ALY-14 tenancy check fails |
| 3 | `production.preflight` | **Ordered schema plan** | owner collects production `/api/build-info` and ledger (read-only); `release prepare … --out-dir <dir>` writes `manifest.json` | production is not serving the `main` SHA the manifest replaces; the production ledger is unknown; the plan finds a ledger orphan, an out-of-order version, a renumbered duplicate, a migration edited in place, a version collision on main, or a destructive migration ahead of an additive one |
| 4 | `owner.approval` | **Explicit owner approval** | owner reads `release runbook --manifest <dir>/manifest.json`, then `release approve --manifest … --approver <owner> --confirm <first 12 of manifest sha256>` | no approval; the approval names another manifest, candidate or staging verification; it is expired, dated in the future, older than the staging verification, or valid for more than 24 h; the approver is not an owner; it was given for another environment (a rehearsal approval never authorizes production) |
| 5 | `production.snapshot` | **Rollback point** | confirm a Supabase backup or PITR point; `pg_dump -Fc`, record its sha256 and the pre-release fingerprint | no approval with `snapshot` scope |
| 6 | `schema.expand` | **Ordered schema change** | `release check-ledger` (the ledger must be the one approved), then for each expand version, in order: `release emit-apply --version v \| psql --single-transaction` | the ledger moved since approval; any file fails. **Hold**: the failing file left nothing, and the previous build still serves |
| 7 | `code.deploy` | **Release** | check `git ls-remote origin main` equals the approved previous SHA; `git push origin <candidate>:refs/heads/main` (fast-forward, never `--force`); poll production `/api/build-info` until it serves the candidate | `main` moved since approval (compare-and-swap); not a fast-forward |
| 8 | `production.verify` | **Production checks** | build-info, ledger, fingerprint, org listing (read-only) → `release check-production --stage expand\|final` | production serves another SHA, branch, environment or Supabase project; the ledger is not the expected set; the fingerprint differs from staging's; any public table lacks RLS; a ZZ Alloy QA org, a staging-seed org or a live self-test org is present. **→ `code.rollback`** |
| 9 | `schema.contract` | **Ordered schema change (destructive)** | only if the plan has contract migrations, and only with `schema_contract` scope: apply them as in step 6, then `check-production --stage final` | no `schema_contract` scope (the release stays live without them); any file fails (**hold and fix forward**, never roll code back across a contract migration) |
| 10 | `release.record` | **Audit evidence** | `release record --step release.record`, `release verify-audit <dir>/audit.jsonl`; commit `<dir>` | the chain does not verify |

`release record` appends a step's outcome to the chain. For any production step it **refuses** unless the approval verifies for
that step's scope at that moment, so an approval that expires halfway through a release stops the recording too.

## Rollback

| Failure | State | Action | Approval |
|---|---|---|---|
| Steps 1–4 | nothing touched | fix and prepare again | — |
| Step 6, a migration fails | earlier additive files applied; the failing file left nothing; the old build serves | **hold**. The old build tolerates the additive files. Fix forward in a new candidate | new approval for the new manifest |
| Step 7, `main` moved | schema expanded; old build serves | stop; find out who moved `main`; prepare again | new approval |
| Step 8 fails | new build live | **code.rollback**: Vercel → Deployments → the previous production deployment → **Instant Rollback**; wait until `/api/build-info` serves `production_before_sha`; record `code.rollback`. Additive migrations stay. Instant Rollback stops new `main` deploys from taking production until it is undone, so follow with a revert on `main` or a fixed candidate | `code_rollback`, granted with the release |
| Step 9 fails | new build live, schema partially contracted | **hold and fix forward**. The old build may need what was dropped | new approval |
| Data damage discovered later | — | restore from the step-5 snapshot or PITR into a **new** project or branch first, compare, then decide | **new owner approval, never pre-granted** |

## What a release record contains

`manifest.json` (candidate, plan, staging verification hash, expected fingerprint), `staging-verification.json`, `approval.json`,
every observation file, the dump's sha256, and `audit.jsonl`. Each audit entry carries the hash of its body and of the
previous entry, so an edit, a deletion or a reordering fails `verify-audit`.

## Rehearsal (non-live)

```bash
npm run test:release-procedure      # offline: every control, 24 tests
npm run test:release-rehearsal      # Docker, local only: 17 end-to-end scenarios
npm run release -- rehearse --out-dir <dir>   # the same scenarios, keeping manifests, approvals and audit chains
```

The rehearsal runs the real `prepare` and `execute` sequence (`release-runner.mjs`) and the real checks against stand-ins. Staging
and production are two databases in one throwaway `postgres:17-alpine` container, labelled `alloy.purpose=p6-release-rehearsal`
and run with `--network none`. "origin" is a local bare clone, and the deploy is a compare-and-swap `update-ref`, never a push. "Vercel" is a loopback
build-info server whose production build follows origin's `main` unless an instant rollback pins the previous build. The
rehearsal config replaces every environment identity, and `rehearsalConfigRefusal` rejects the real project refs and any
non-loopback URL. Migrations are applied with `wrapMigrationForApply`, the same text `emit-apply` gives the owner.

## Limits, stated plainly

- **The approval proves an owner was at a terminal, not who.** Binding it to an identity, for example a GitHub review by the owner's
  account on the candidate PR, or a signed tag, is a prerequisite before this is treated as more than a speed bump.
- `required_checks` holds workflow names from P4. They have to be confirmed against the real check-run names on `staging`
  commits before step 2 can pass live.
- The expand/contract classification is a text heuristic, biased towards *contract*. It does not prove that the old build is
  compatible with the expanded schema. That rests on review and on staging having run the two together.
- The fingerprint covers the `public` schema (columns, policies, function signatures, indexes, RLS). It does not cover
  `auth`, `storage`, extensions or vault secrets (P4 F7: set `scheduled_work_wake_url` before the wake credential).
- **The first promotion is not a routine release.** Production's ledger has never been read, and main's chain has three version
  collisions (P4). `release plan` blocks the P4 candidate for exactly those reasons. Bringing production to the staging
  schema, and deciding on the Vercel Cron (P4 H1–H3), comes first. After that, every release takes this path.
