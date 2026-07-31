# Migration promotion controls

Written after the 2026-07-31 staging ledger repair. Scope is deliberately narrow:
stop staging's migration history from breaking again. This is not a migration
platform redesign.

## The recurring defect

Four occurrences in three weeks, all the same shape:

| When | What happened | Cost |
| --- | --- | --- |
| ~2026-07-22 | 3 migrations applied via the Supabase dashboard; repo held the identical SQL under different versions | 28-migration backlog stalled for ~5 days |
| 2026-07-25→26 | 4 assignment-platform migrations applied from an active worktree before their branch merged | reconciliation re-broken 3 times |
| 2026-07-30 | Access & Roles V2 Phase 0 applied via dashboard as `20260730000602`; repo twin `20260729120000` on an unmerged branch | **blocked every promotion, including Conversation Platform Phase 0** |
| 2026-07-30 | `20260730212000` / `20260730212100` applied out-of-band; schema present, ledger absent | silent drift in the opposite direction |

**One root cause: migrations reach shared staging by a route that does not
update the ledger from a committed repository file.**

Both directions hurt:

- **ledger ahead of repo** (remote-only version) → `supabase db push` refuses to
  run at all, so *everyone* is blocked by *one* team's shortcut.
- **repo ahead of ledger** (schema applied, unrecorded) → drift is silent until
  someone replays, and a non-idempotent migration then fails.

## Controls, smallest first

### C1 — Preflight before any staging push *(implemented)*

`scripts/migration-preflight.mjs` — no dependencies, safe in CI.

```bash
node scripts/migration-preflight.mjs                      # repo-only
node scripts/migration-preflight.mjs --db-url "$DB_URL"   # + ledger
```

Rejects: duplicate versions, malformed filenames, non-monotonic ordering,
remote-only versions (orphans), and unexpected local-only versions.

Verified against the real outage: run against the pre-repair tree it fails with
exactly `remote-only version(s) with no repository file: 20260729120000`. It
would have caught this before it blocked anyone.

**Adopt as:** a required CI check on any branch touching `supabase/migrations/`,
and the first step of any promotion runbook.

### C2 — Migrations may only be applied from a committed repository file

No dashboard SQL editor for schema migrations. No applying a file that is
untracked, uncommitted, or only on an unmerged branch.

*Rationale:* every incident above began by violating this one rule. The dashboard
mints its own version, which is precisely what strands the ledger.

**Documented exception:** emergency repair, which must (a) be recorded in the
repo within the same working day under the canonical version, and (b) be
reconciled with `supabase migration repair`, not left for someone else.

### C3 — Staging pushes run only from `origin/staging` or an approved promotion branch

Applying from a feature worktree is how migrations reach staging before their
branch merges — which then makes the merge itself a conflict.

### C4 — Migrations must be idempotent

`IF NOT EXISTS` / `IF EXISTS` / `CREATE OR REPLACE` / `DROP … IF EXISTS` before
create.

*This is not theoretical.* The Access V2 Phase 0 migration is **not** idempotent
(bare `DROP TABLE`, bare `CREATE VIEW`, unguarded `ADD CONSTRAINT`) and was
proven on 2026-07-31 to fail on re-run with
`constraint "role_permission_grants_permission_definitions_fkey" … already exists`.
That single fact dictated the repair strategy: the ledger had to be corrected
**without re-executing the SQL**, because re-execution would have failed.

By contrast `20260730212000` and `20260730212100` are fully idempotent, which is
why re-running them through `db push` was a safe no-op that preserved all 5 rows
of live `operator_stage_membership_acks` data.

**Adopt as:** a review checklist item. A non-idempotent migration is not
promotable.

### C5 — Record provenance for every staging mutation

Branch, commit SHA, migration version, operator. Today `created_by` is the only
signal, and `support@workwithalloy.com` tells you a human used the dashboard but
nothing about which work it belonged to — identifying the owner of
`20260730000602` required matching SQL text across worktrees.

**Cheapest version:** a line in a promotion log. No tooling required.

## Repairing an orphan correctly

The CLI suggests `migration repair --status reverted <remote-version>`. **That is
often the wrong fix**, and it is worth stating why.

Reverting alone deletes the ledger row while the schema change stays live. If the
owning branch later merges its version, `db push` will try to run SQL whose
effects already exist — and if the migration is not idempotent, it fails.

Correct sequence when a repo twin exists:

1. Prove the twin is semantically identical to what ran (diff the ledger's
   `statements` against the file).
2. Vendor the repo file onto the promotion branch, path-scoped, SQL only.
3. `migration repair --status applied <canonical-repo-version>` — records truth,
   executes nothing.
4. `migration repair --status reverted <dashboard-version>` — retires the twin.
5. `db push`.

## Operational note

The pooled `DATABASE_URL` uses port **6543** (transaction pooler), which breaks
the CLI's named prepared statements —
`ERROR: prepared statement "lrupsc_1_0" already exists (SQLSTATE 42P05)`.
Use the **session pooler on 5432** for `supabase migration repair` and
`supabase db push`. The failure is safe (it aborts before writing) but wastes a
cycle if you do not expect it.
