# Platform anon privilege revocation — certification record

**Issue #318 (A).** Platform-owned. Not Trust Runtime.
**Base:** staging `51f12253989206a364e162dafa3544a13a207107` (rebased) · **Re-certified:** 2026-08-04
**Migration:** [`20260804180000_platform_anon_privilege_revocation.sql`](../../supabase/migrations/20260804180000_platform_anon_privilege_revocation.sql)

## 1. Before / after anon privilege census

Both measured on a **from-empty replay** of the full migration chain — 308 migrations
before, 309 after.

| Surface | Before | After |
|---|---|---|
| Tables/views granting to `anon` | **231 objects / 1617 grant rows** (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — all 7 on each) | **0 / 0** |
| Functions `anon` can EXECUTE | **126 of 128** (34 of them `SECURITY DEFINER`) | **1** — `get_quote_pricing` only |
| Sequences `anon` can use | 0 exist; defaults would have granted on any future one | **0**, and future ones no longer inherit |
| `anon` USAGE on schema `public` | true | **true** (retained — required to reach the approved RPC) |
| `postgres` default ACLs granting to `anon` | tables + sequences + functions | **0** |
| `supabase_admin` default ACLs | tables + sequences + functions | unchanged — see §5 |

## 2. Why revoking from `anon` alone was not enough

The first run of this migration **failed its own verification**:

```
ERROR: ANON PRIVILEGE FAIL 3: anon can execute 94 non-approved function(s) in public
```

PostgreSQL grants `EXECUTE` to **PUBLIC** on every function by default, visible in
`proacl` as a leading `=X/postgres` entry. `anon` inherits EXECUTE through PUBLIC, so
revoking anon's own entry leaves the privilege intact. 94 of 128 functions carried it.

The fix is `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC`, which is safe for
the roles this mission must not touch — measured, not assumed:

| Role | Effective EXECUTE | Explicit grants |
|---|---|---|
| `authenticated` | 126 | **126** |
| `service_role` | 128 | **128** |

Every grant they hold is explicit, so neither depends on the PUBLIC entry. **0 tables or
views** in `public` carry a PUBLIC ACL entry, so tables needed no equivalent treatment.

## 3. Proof that `authenticated` and `service_role` were not changed

A 4580-line fingerprint was captured from two from-empty replays — one at 308 migrations
(without the revocation), one at 309 (with it):

```
GRANT|<role>|<table>|<privilege>                      3574 lines
POLICY|<table>|<policy>|<cmd>|<roles>|md5(USING~CHECK)  750 lines
FUNCEXEC|<role>|<function>                              254 lines
                                                       ----
                                                       4580
diff before after  →  IDENTICAL, 0 differences
```

**The comparison is OID-independent, deliberately.** An earlier revision of this
fingerprint included `pg_proc.oid`. OIDs are assigned per database build, so two
from-empty replays never share them, and the rebased run surfaced 246 lines differing by
nothing but a renumbered OID. The identity of a function for this purpose is
`(role, name)`; including the OID measured which database you were looking at rather than
what the migration changed.

This covers every `authenticated` and `service_role` table/view privilege, **every one of
the 750 RLS policies including a hash of its `USING` and `WITH CHECK` expressions**, and
every function EXECUTE grant for both roles. Not one byte changed.

## 4. Behavioural certification

Probed directly as `SET ROLE anon` against the post-migration database:

| Attempt | Result |
|---|---|
| `SELECT` from `opportunities` | **permission denied for table opportunities** |
| `SELECT` from `org_settings` | **permission denied for table org_settings** |
| `INSERT` into `field_definitions` | **permission denied for table field_definitions** |
| `UPDATE opportunities` | **permission denied for table opportunities** |
| `DELETE FROM persons` | **permission denied for table persons** |
| unapproved `SECURITY DEFINER` fn (`seed_default_rbac`) | **does not exist** — not visible to the role |
| `has_function_privilege('anon', get_quote_pricing)` | **true** |
| `get_quote_pricing(...)` | enters the function body and raises its own business error — **EXECUTE preserved** |
| `service_role` reading `opportunities` | **3000 rows** — data path green |

Denial is now at the **privilege** layer. Previously these same attempts were refused only
by RLS, which was the entire point of the issue.

### Auth flows

| Flow | Result |
|---|---|
| `POST /auth/v1/token?grant_type=password` | access_token issued, role `authenticated` |
| `GET /auth/v1/user` with that token | returns `qa.operator@northwind.invalid` |
| `POST /auth/v1/recover` | HTTP 200 |

### Application end-to-end

Dev server on `:3016` against the revoked database: operator signs in, `/workspace/work-unit/new-leads`
renders the lead list, Focus Panel, Household, Assignments and Children. Service-role paths
green throughout.

## 5. Known limitation — `supabase_admin` default ACLs

The migration corrects default privileges for **`postgres`**, which is the owner that
matters: repository migrations run as `postgres`, so every table this repo creates from
here on is clean. Altering **`supabase_admin`**'s defaults requires membership in that
role, which a migration does not have:

```
NOTICE: insufficient privilege to alter default ACLs for role supabase_admin
        — existing objects are still corrected below
```

This is reported rather than hidden. Objects created *by supabase_admin* in `public`
(Supabase internals, rare) would still inherit an anon grant. Every such object that
exists today is already corrected by the bulk `REVOKE` in step 2; only hypothetical future
supabase_admin-owned objects are affected. Closing that residue needs a superuser action
outside the migration system.

## 6. Not done / needs attribution before merge

- **Production graph and Full graph have not been run.** This host cannot execute
  `npm run typecheck` (exit 144 at every heap size, even `--listFilesOnly`). CI is the
  authority and runs on PR.
- **Console warning, attribution unverified.** The workspace surface logs a React RSC
  warning — *"Only plain objects can be passed to Client Components"* — naming
  `alloy.config.unknownFields` on work-view records. `row_grain_v1` appears in the payload.
  That field is parsed (`lib/lifecycle/workViewsConfigV1.ts`), so the symbol is the
  pre-existing `captureUnknownFields` mechanism rather than an unrecognized key — **but
  this was not proven against a tenant seeded without `row_grain_v1`**, and it is unrelated
  to this migration. It should be attributed before merge.

## 7. How to re-run

```bash
alloy-stack use <worktree>
supabase --workdir "$PWD/certification" stop --no-backup   # force from-empty
alloy-stack use <worktree>                                  # replays all 309 migrations
```

The migration self-verifies: nine assertions covering anon tables, anon sequences, the
approved-RPC allowlist, `postgres` default ACLs, schema USAGE, and — failing closed —
that `authenticated` and `service_role` were not narrowed.
