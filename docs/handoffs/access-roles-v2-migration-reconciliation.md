# Handoff — Access & Roles V2 migration reconciliation

**To:** the owner of `agent/claude/1-vac-access-roles` (worktree `wt1-vac-access-roles`)
**From:** staging migration repair sprint, 2026-07-31
**Scope:** migration hygiene only. No Access V2 product work is requested or implied.

**Your branch was not modified.** It has uncommitted changes (`web/package.json`),
so it is treated as actively owned.

---

## 1. What happened to your Phase 0 migration

Your `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`
was applied to shared staging **through the Supabase dashboard**, which minted its
own ledger version `20260730000602` (`created_by support@workwithalloy.com`)
instead of using your repo version.

That left the staging ledger holding a version with no repository file, which made
`supabase db push` abort for **everyone**:

```
Remote migration versions not found in local migrations directory.
```

This blocked all promotion to staging, including Conversation Platform Phase 0.

## 2. What was done — and what it means for you

| Action | Effect on your branch |
| --- | --- |
| Your `.sql` file was vendored verbatim onto `ops/staging-migration-ledger-repair` | The **same path, same bytes**. When your branch merges, git sees identical content — no conflict, no duplicate version. |
| `migration repair --status applied 20260729120000` | Staging now records your canonical version as applied. **Your migration will not re-run on merge.** |
| `migration repair --status reverted 20260730000602` | The dashboard twin is retired. |

**Verified identical before vendoring:** the ledger's stored `statements` versus
your file differ by exactly one trailing newline.

**Nothing of yours was deleted or rewritten.** The canonical file is the one you
wrote.

## 3. Your Phase 1 migration is correctly pending

`20260729140000_access_v2_phase1_access_audit_log.sql`:

- **not** in the staging ledger (count = 0)
- `public.access_audit_log` **absent** from staging

It is genuinely unapplied and not silently represented. Nothing to reconcile.

## 4. What you need to do

### 4.1 Rebase onto `origin/staging` once the repair lands

After `ops/staging-migration-ledger-repair` merges, rebase or merge
`origin/staging`. Expect **no conflict** on the Phase 0 migration — identical
content at an identical path. If git does surface it, resolve by **keeping the
file**. Do not delete it: staging's ledger now points at that exact version.

### 4.2 Harden the Phase 0 SQL for replay *(recommended, not required for merge)*

Your Phase 0 migration is **not idempotent**. Proven by re-run test on 2026-07-31:

```
ERROR: constraint "role_permission_grants_permission_definitions_fkey"
       for relation "role_permission_grants" already exists
```

This does **not** affect staging — the ledger repair means it will never re-run
there. It **does** break any clean-replay or disaster-recovery scenario, and it is
why the repair had to correct the ledger rather than simply re-push.

Two changes make it replay-safe **without altering the already-applied semantic
result**:

```sql
-- (a) guard the FK add — this is the statement that actually fails on re-run
ALTER TABLE public.role_permission_grants
    DROP CONSTRAINT IF EXISTS role_permission_grants_permission_definitions_fkey;
ALTER TABLE public.role_permission_grants
    ADD CONSTRAINT role_permission_grants_permission_definitions_fkey
    FOREIGN KEY (permission_key)
    REFERENCES public.permission_definitions (key)
    ON DELETE RESTRICT;

-- (b) drop the legacy objects only while they are still TABLES.
--     On a re-run they are already VIEWS, and `DROP TABLE` fails against a view.
DO $harden$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname='public' AND c.relname='permissions' AND c.relkind='r') THEN
        DROP TABLE public.permissions;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname='public' AND c.relname='permission_keys' AND c.relkind='r') THEN
        DROP TABLE public.permission_keys;
    END IF;
END
$harden$;

DROP VIEW IF EXISTS public.permissions;
DROP VIEW IF EXISTS public.permission_keys;
-- then the existing CREATE VIEW statements, unchanged
```

**Validation status — read this before applying.** The patch is derived directly
from the observed failure and addresses both known re-run faults. It has **not**
been validated end-to-end on a clean replay, because the shared local
`alloy-cert` stack was in use by another worktree at the time (see §6) and
resetting it would have clobbered their work. **Please run a clean replay after
applying it**, and treat the two guards as a starting point rather than a
verified patch.

### 4.3 Before you merge

Run the new preflight from your branch:

```bash
node scripts/migration-preflight.mjs --db-url "$STAGING_DB_URL"
```

It fails on remote-only versions, local-only versions, duplicate versions and
malformed filenames. Expect it to report your Phase 1 migration as pending
(`--allow-pending` if that is intended at that moment).

## 5. Do not do this again

Applying schema through the Supabase dashboard is what caused this. It has now
happened four times in three weeks across different sprints and has twice stalled
unrelated teams for days.

See `docs/platform/governance/migration-promotion-controls.md`. The short version:
**migrations may only reach shared staging from a committed repository file, run
from `origin/staging` or an approved promotion branch.**

## 6. Related hazard, for your awareness

All 44 managed worktrees configure `project_id = "alloy-cert"`, so they share one
local Docker Supabase stack. A `db reset` in any worktree destroys whatever
another worktree was certifying. This is the local analogue of the shared-staging
problem above and is worth a separate decision — it is out of scope for this
repair.
