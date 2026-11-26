---
owner: runtime
status: proposed
last_reviewed: 2026-11-26
supersedes: []
status_note: Evidence index for slice RO1 of objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 (the read-only role `alloy_readonly` for the new project and staging, proven locally). Not doctrine. Nothing here touched a hosted project.
---

# RO1 evidence: the read-only role, proven locally (step 5, M7)

Slice RO1 of the ALY-14 first promotion. The script the owner runs is
[`../environments-readonly-role-2026-11-27.sql`](../environments-readonly-role-2026-11-27.sql). It runs on both projects:
the new project `tjziptdknxdajzauctha` (`PRODUCTION_DB_URL_READONLY`) and staging `ikaxilmwmrmbagoidedu`
(`STAGING_DB_URL_READONLY`). The owner's steps are in the
[owner guide](../environments-owner-dashboard-guide-2026-11-26.md), step 5.

**Proven only locally.** The tests ran on throwaway Supabase Postgres containers (`supabase/postgres:17.6.1.165`, the
image recorded for staging and the old production, PostgreSQL 17.6), with GoTrue's and Storage's own schemas, on an
internal Docker network with no egress. No hosted project, credential or supabase CLI was used. The exact image of the
new project was not observed: the script's own check table (below) is the proof on each hosted project.

Re-run: `bash ro1-readonly-role-check.sh <this-folder>` (about 5 minutes; Docker and the images above; teardown removes
every container and the network). Transcript: [`run.txt`](run.txt).

## 1. What read-only access needs

Every query run against a READONLY URL in the [briefing](../environments-p1s-first-promotion-briefing-2026-11-25.md) §4.1
and §5.6.1, the [plan](../environments-final-cutover-plan-2026-11-26.md) §2, and the runbook that `release runbook`
prints (`scripts/release/alloy-release.mjs`). The SQL is what the tools emit, saved in [`queries/`](queries/)
(`SHA256SUMS`).

| Read | Run at | URL | Reads |
|---|---|---|---|
| `emit-sql ledger` | 7 (staging); runbook *census*, *after* (15) | both | `supabase_migrations.schema_migrations` |
| `emit-sql ledger-if-present` | 7, runbook *before*, *pre-chain* (9) | new project | `to_regclass(...)`, then the ledger as above. The table does not exist before step 9 |
| `emit-sql fingerprint` | 7 (both), runbook *census*, *after* | both | `information_schema.columns` (public), `pg_policies`, `pg_proc`/`pg_namespace`, `pg_indexes`, `pg_class` |
| `emit-sql census` | runbook *census* (9), 15b, 16.6, 16.R | new project | `pg_extension`; `storage.buckets` (through `query_to_xml`); `public.scheduled_work`; `count(*)` of **every** public base table (`information_schema.tables`) |
| `emit-sql orgs` | 7 (staging), runbook observations, 16.6, 16.R | both | `public.orgs` |
| `tenant:config:export` | 6 | staging | `public.orgs`, `public.locations`, `public.customer_person_role_types`, `public.departments`, `public.work_units` (`EXPORT_READ_TABLES`) |
| routine `renderRunbook` observations | later releases | production | the same `ledger`, `fingerprint` and `orgs` SQL, inline |

So the role needs `USAGE` and `SELECT` on: every table and view in `public`; `supabase_migrations` and its ledger
table; and `storage.buckets`. The catalog views need nothing extra.

**Two traps the grants avoid.**

- `information_schema.columns` and `information_schema.tables` list only tables the caller has a privilege on. With
  SELECT on some tables, the fingerprint's `columns_md5` and the census's row list would silently differ from
  `postgres`'s. The role reads every public table and view.
- `ledger-if-present` returns nothing both when there is no ledger and when the role cannot see it. Without access, the
  release tool would read a full ledger as **empty**. So the script creates `supabase_migrations` (empty, the same
  `create schema if not exists` as `emit-sql ledger-table`) and sets its default privileges before step 9 creates the
  table.

Step 14's clock reads (`scheduled_work_clock`, `net._http_response`, `cron.job_run_details`) name no URL in the plan.
`scheduled_work_clock` is in `public`, so it is covered. The `cron` schema is not granted.

**BYPASSRLS: needed.** Every public table has RLS on (`rls_disabled|0`), and no policy names this role. A role with the
same SELECT grants but **without** BYPASSRLS read **0** orgs (the role read 2), and an export with `"org": null` and no
locations, with no error (`case-*/control-nobypassrls-*.txt`). The counts, orgs and export would all be wrong.

**Can Supabase's `postgres` grant it?** Yes, on this version. In the image, `postgres` is **not** a superuser, but has
`CREATEROLE` and `BYPASSRLS`. Since PostgreSQL 16, a role that is not a superuser may give BYPASSRLS only if it has it
itself, and it does. The script, run as `postgres`, sets it (check row 1 `ok` in every run). Supabase's own guide does
the same from the SQL Editor (`create role backup_reader login password '…' bypassrls;`, *pg_dump fails with "query would
be affected by row-level security policy"*). Only `NOSUPERUSER` cannot be named by `postgres`, so the script leaves it
out; check row 1 confirms the role is not a superuser.

**Fallback if a project refuses BYPASSRLS** (check row 1 says `WRONG`): do not add policies for the role, because new
policies change `policies_md5` and the fingerprint would no longer equal staging's. Instead, run the reads as `postgres`
with `PGOPTIONS='-c default_transaction_read_only=on'`, as the export already does. That keeps the session read-only,
but loses the privilege wall below, so it needs the owner's decision.

## 2. Results (both cases, 74 checks, 0 failed)

| | Case A: new project (empty; script, then the chain) | Case B: staging (chain applied; script after it, twice) |
|---|---|---|
| Role script, as `postgres` | 9 of 9 checks `ok` (`case-a/role-script-on-empty.txt`) | 9 of 9 `ok`, and the same on the second run (`case-b/role-script-*.txt`) |
| Chain, as `postgres` | 558 files, ledger 558, head `20261223090000`; the script was **not** run again: its check table, re-read, is 9 of 9 `ok` (`checks-after-chain.txt`) | 558 files, head `20261223090000`, before the script |
| Step 7 reads before the chain | `ledger-if-present` empty and fingerprint `tables\|0`, equal to `postgres`'s | — |
| `ledger`, `ledger-if-present` (558 lines), `fingerprint`, `census` (30 lines), `orgs`, export | each **byte-for-byte equal** to `postgres`'s, exit 0 | each byte-for-byte equal, exit 0 |
| Refusals (`refusals.txt`) | 29 refused, 0 allowed; `postgres`'s census unchanged | 29 refused, 0 allowed; census unchanged |

The export ran as `tenant:config:export` runs it (`PGOPTIONS=-c default_transaction_read_only=on`, `-q -A -t -v org_id=…`).
A local org row (`93667019-…`, one site) stands in for Firefly's.

**Refused, as `alloy_readonly`** (one session each; each "read-only off" test runs
`SET default_transaction_read_only = off` as its own statement first):

- Writes in the default session: INSERT, UPDATE, DELETE and TRUNCATE are refused by the read-only transaction.
- Read-only off, then a write: refused by **privilege**, `permission denied for table …`. This covers INSERT, UPDATE,
  DELETE and TRUNCATE on `orgs` and `locations`, `BEGIN READ WRITE`, a DELETE on the ledger, and an UPDATE on
  `storage.buckets`. Public has no sequence on this chain, so `nextval` is skipped.
- DDL with read-only off: CREATE TABLE and CREATE FUNCTION in public get `permission denied for schema public`. CREATE
  SCHEMA gets `permission denied for database postgres`. ALTER TABLE, DROP TABLE and CREATE INDEX get
  `must be owner of table …`.
- Widening itself: `SET ROLE postgres` is refused, and so is `ALTER ROLE` in the default session.
- Writing SECURITY DEFINER functions (owned by `postgres`), with read-only on or off: `consume_rate_limit`,
  `document_configuration_seed` and `certification_reset_execute` get `permission denied for function …`. The
  migrations keep every writing SECURITY DEFINER function in public closed to PUBLIC. Of the 128 SECURITY DEFINER
  functions there, the 10 that PUBLIC can execute are 8 trigger functions and 2 stable reads. A direct call to a
  trigger function is refused: `trigger functions can only be called as triggers`.

## 3. What PUBLIC still reaches (measured)

Postgres and Supabase grant some things to every role (PUBLIC). This script cannot take them away from one role, and
`postgres` cannot revoke Supabase's own grants. **In the role's default read-only session every one of them is
refused.** A session that **deliberately** turns read-only off can do the following (`case-*/public-reach.txt`; in each
case 5 of 5 succeeded):

1. `lo_create(0)`: it creates a large object.
2. `net.http_get(...)`: it queues an outbound HTTP request through pg_net. Here the network has no egress; on a hosted
   project, the request would leave.
3. INSERT into `net.http_request_queue` and `net._http_response` (PUBLIC has all privileges on them).
4. A temporary table. It lasts only for that session; none was left afterwards.
5. `ALTER ROLE alloy_readonly SET default_transaction_read_only = off`. Postgres lets every role change its own defaults.
   The script's check row 2 then says `WRONG`, and running the script again restores it (`ok`).

None of these writes to a public table, the ledger or Storage, and none can call a writing function. They are why the
URL is a secret held only in the owner's secret store, and why no command in the plan or the runbook sets `default_transaction_read_only`.

## 4. Connection strings and `fp_target`

[`fp-target-forms.txt`](fp-target-forms.txt) runs the runbook's `fp_target` exactly as `renderFirstPromotionRunbook`
prints it for `tjziptdknxdajzauctha`, and the export's staging guard, against each form (placeholder passwords).

| Variable | Form (session pooler, port 5432) |
|---|---|
| `PRODUCTION_DB_URL` | `postgresql://postgres.tjziptdknxdajzauctha:<password>@<pooler-host>:5432/postgres` |
| `PRODUCTION_DB_URL_READONLY` | `postgresql://alloy_readonly.tjziptdknxdajzauctha:<password>@<pooler-host>:5432/postgres` |
| `STAGING_DB_URL_READONLY` | `postgresql://alloy_readonly.ikaxilmwmrmbagoidedu:<password>@<staging-pooler-host>:5432/postgres` |

`<pooler-host>` is the one the project's **Connect** panel shows under *Session pooler*. For the new project it is in
`us-west-2` (for example `aws-0-us-west-2.pooler.supabase.com`). Staging's region was not observed here, so its host is
copied from staging's own panel. The direct host `db.<ref>.supabase.co:5432` is IPv6-only without the IPv4 add-on, and
the transaction pooler (6543) is refused.

- **`fp_target` already accepts the session-pooler form** (and the direct form) for the new ref. It refuses 6543, the
  previous ref, and staging's ref. **No change was made.**
- **What `fp_target` does not check:** it refuses only `:6543`. It accepts any other port (`:5433` was accepted) and a
  URL with no port, and it matches the ref anywhere in the string. The plan's wording "accepts only the new ref on port
  5432" overstates it: the plan now says what it does. Tightening it is left over (not part of this slice).
- `tenant:config:export --target staging` accepts `alloy_readonly.ikaxilmwmrmbagoidedu` on the pooler and the direct
  host, and refuses the new ref (`wrong_project`).

## Files

- `ro1-readonly-role-check.sh`: the harness. `run.txt`: its transcript.
- `queries/`: the exact SQL of each read, with `SHA256SUMS`.
- `case-a/`, `case-b/`: the role script's output, the chain log, each read as `postgres` and as `alloy_readonly`, the
  no-BYPASSRLS control, `refusals.txt` and `public-reach.txt`.
- `fp-target-forms.txt`: the connection-string forms against `fp_target` and the export's guard.
