---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P2 production snapshot and isolated restore (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P2. Builds on
[P1](environments-p1-production-census-2026-11-25.md).
Run window: 2026-11-25 22:20–22:23 UTC. Evidence: [`environments-p2-evidence-2026-11-25/`](environments-p2-evidence-2026-11-25/),
with its checksums in [`environments-p2-evidence-2026-11-25.sha256`](environments-p2-evidence-2026-11-25.sha256).

## Outcome in one paragraph

A **schema-only** snapshot of production `public` was taken, its integrity was checked, and it was restored into a
throwaway Postgres container with no network. The restored catalog matches production exactly: same object counts and
the same fingerprints for columns, policies, functions and indexes. Production was not changed. **This is not a full
backup.** The only login available (`walden_readonly`) cannot read rows (every `public` table has RLS, and the role
lacks BYPASSRLS), and it cannot reach `auth`, `storage`, `vault` or `supabase_migrations`. A **data** snapshot and the
**platform configuration export** (Vercel, Render, Supabase project settings) are still blocked on access, as in P1.

## Access used (minimum)

- Keychain item `alloy-production-readonly-db` (account `walden`) → Supabase session pooler (port 5432), project
  `vslwnntzzgpnmrpjipat`, role `walden_readonly`. The URI and password were read into a process environment variable only.
  They were never printed, logged or written to disk. Every evidence file was scanned for URIs, pooler hosts and JWTs, and none had any.
- Every production session ran with `default_transaction_read_only=on`, and pg_dump also opens its own
  `REPEATABLE READ, READ ONLY` transaction. The role has no write grants anyway (P1).
- No platform tokens were used. None exist on this Mac.

## Snapshot

| Item | Value |
|---|---|
| Command | `pg_dump --schema-only --schema=public -Fc` (read-only session) |
| Taken | 2026-11-25 22:20:15 → 22:20:20 UTC, exit 0, no warnings (`pg_dump.log`) |
| Source | PostgreSQL 17.6 (Supabase), dumped by pg_dump 18.6 |
| Archive | custom format, gzip, 1,850 TOC entries, 857,535 bytes |
| **SHA-256** | `0dede78b0f9210f56a0cd2258054f86dfe6d9cceab4c627d831dc539b8f83440` |
| Stored at | `~/.local/state/alloy/prod-snapshots/2026-11-25-p2/prod-public-schema.dump` (dir `0700`, file `0600`). This is **outside the repo** and was **not committed**. |

TOC contents: 134 tables, 134 RLS enables, 362 policies, 386 indexes, 195 constraints plus 290 foreign keys, 71 triggers,
34 functions, 2 views, 1 type, 171 ACLs, 6 default ACLs, 56 comments (`toc-summary.txt`).

**Data probe:** a `--data-only -t public.orgs` dump fails with `query would be affected by row-level security policy
for table "orgs"` (`data-dump-probe.log`). That makes the data blocker concrete. pg_dump will not silently write an empty data dump.
`--enable-row-security` would produce one, so it was not used: it would look like a backup while holding no rows.

### Integrity verification

1. `shasum -a 256 -c` against the recorded hash: **OK**, both right after the dump and again after the restore.
2. `pg_restore --list` parses the full TOC (exit 0).
3. `pg_restore -f` decodes every compressed block to SQL (620,673 bytes, exit 0).
4. The TOC counts agree with a live catalog count taken in the same window (`live-catalog-counts.txt`).
5. The restored database matches production on every measure (next section). This is the strongest check.

### Secret scan of the snapshot

The SQL was scanned for JWTs, `sk_`/`rk_`/`whsec_`/`sbp_`/AWS/Slack/GitHub/SendGrid key prefixes, bearer or password
literals, URLs, `net.http_*`/`vault.` calls and email addresses: **0 hits** for each. There are no
`pg_net` triggers carrying service keys.

## Isolated throwaway target

Container `alloy-p2-restore-20261125`, from the local image `postgres:17-alpine`. No image was pulled. It was started with
`--network none --rm --tmpfs /var/lib/postgresql/data:size=1g`, labelled `alloy.purpose=p2-throwaway-restore`, and used local trust auth,
so no credential was created. This is not a Supabase stack, and the shared `alloy-cert` stack and all other containers were untouched.

Isolation was proven **before** restoring (`isolation-evidence.txt`):

| Check | Result |
|---|---|
| Network mode / attached networks | `none` / `none` |
| Published ports / port bindings | `{}` / `{}` |
| Mounts | `[]`. The data dir is tmpfs only, so nothing persists past the container. |
| Interfaces inside the container | `lo` only (127.0.0.1, ::1) |
| Routes | none |
| DNS lookup of the production pooler host | `Network unreachable` |
| HTTPS egress | `bad address`, rc=1 |
| Identity | system_identifier `7712237757228720170`, PostgreSQL 17.11 musl (production is 17.6 gnu); only `postgres,template1,template0`; no `walden_readonly` role; 0 public tables |

The restore input crossed into the container only as the dump file on stdin (`docker exec -i … pg_restore < dump`).
The container had no way to reach production or any other environment.

Teardown (`teardown.log`): the container was stopped at 22:22:35 UTC, auto-removed, and `docker ps -a` for the label is empty. No
volume was created.

## Restore log

Full verbose logs: `restore-attempt1.log`, `restore-attempt2.log`, `restore.log`. Each attempt used `--single-transaction --exit-on-error`, so a failed attempt left no partial schema.

| Attempt | Result | Cause / fix |
|---|---|---|
| 1 | rolled back | `schema "public" already exists`. Fix: `DROP SCHEMA public` in the fresh throwaway DB before restoring. |
| 2 | rolled back | The prerequisites stopped at `role "anon" already exists` (roles are cluster-wide and survived attempt 1), so `auth` was never created and the FK to `auth.users` failed. Fix: idempotent role creation. |
| 3 | **pg_restore exit 0**, 22:22:16 UTC | 1,666 objects created |

Restore options: `--no-owner --no-privileges`. Production owners and grants (`postgres`, `walden_readonly`, …) do not
exist in the target. They stay in the archive's ACL entries for a real recovery.

`platform-prereqs.sql` creates stand-ins for what Supabase provides and the role cannot dump. These are shapes only, with no data:
the roles `anon`/`authenticated`/`service_role`, `auth.users(id)`, `auth.uid()`, `auth.role()`, and `pgcrypto` and `uuid-ossp` in
schema `extensions`.

### Restored vs production

| Measure | Production | Restored |
|---|---|---|
| tables / views | 134 / 2 | 134 / 2 |
| columns | 1,604 | 1,604 |
| policies | 362 | 362 |
| RLS enabled / forced | 134 / 19 | 134 / 19 |
| FK / other constraints | 290 / 281 | 290 / 281 |
| non-constraint indexes | 386 | 386 |
| triggers / functions | 71 / 34 | 71 / 34 |
| columns md5 | `c5fa4d50…` | match |
| policies md5 (name, cmd, roles, USING, WITH CHECK) | `297ba3f3…` | match |
| functions md5 (signatures) | `e3e985c7…` | match |
| indexes md5 (`indexdef`) | `a4b15e7c…` | match |

The queries are in `catalog-counts.sql` and `schema-fingerprint.sql`. The outputs are in `live-*`/`restored-*`.

## Production unchanged

- After the restore, the catalog counts were identical to the pre-snapshot counts (`live-catalog-counts-after.txt`).
- The `pg_stat_user_tables` activity counters for `orgs`, `payments`, `messages` and `messages_outbox` were identical to P1's figures
  (1/1/22/0, 0/15/57/0, 0/63/118/67, 12/28/25/0).
- All sessions were read-only, and the role holds no write grants.

## Configuration export

- **Database configuration (done, read-only):** `db-config-export.txt` lists the server version, extensions, non-default
  settings visible to the role, role names with their attributes, the count of per-role settings (not their values),
  publications and schema owners. Setting names matching secret/key/password/token/ssl were excluded.
  Notable: `archive_mode=on` with wal-g archiving every 120 s, so the platform already keeps WAL-based backups.
  `supabase_vault` is installed, but vault contents were not and cannot be exported with this role.
- **Platform configuration (blocked):** Vercel, Render and Supabase project settings and environment variable names. As in P1, there is no CLI
  auth or token for any of the three on this Mac.

## Recovery procedure (from this snapshot)

For a throwaway or replacement database. **Never point it at production or the shared `alloy-cert` stack.**

1. Verify the archive: `shasum -a 256 prod-public-schema.dump`, which must equal `0dede78b…3f83440`.
   Then run `pg_restore --list prod-public-schema.dump`, which must exit 0 with 1,850 entries.
2. Provision an empty PostgreSQL 17 database. On a real Supabase project, `auth`, roles and extensions already exist,
   so skip step 3.
3. Bare Postgres only: drop the empty `public` schema, then
   `psql -v ON_ERROR_STOP=1 -d <db> -f platform-prereqs.sql`.
4. `pg_restore -d <db> --exit-on-error --single-transaction [--no-owner --no-privileges] prod-public-schema.dump`.
   On a Supabase target, omit `--no-owner --no-privileges` so the production grants are restored. Expect to remove
   `walden_readonly` grants, or create that role first.
5. Verify: run `catalog-counts.sql` and `schema-fingerprint.sql` against the target and compare them with the `live-*` files.
6. Data: **not recoverable from this snapshot.** Row data needs Supabase's platform backups or PITR (WAL archiving is on),
   or a dump by a role with BYPASSRLS.

## Data-handling concerns

1. **This snapshot holds no customer data.** It holds only the schema, with function bodies and policy text, and it has no secrets (scan above).
   It is still production structure, so it is kept outside the repo at `0700`/`0600` and was not committed. Delete
   `~/.local/state/alloy/prod-snapshots/2026-11-25-p2/` when no longer needed. The committed evidence is metadata only.
2. **A full backup needs more privilege than this role should have.** The options are BYPASSRLS on a dedicated backup role,
   with USAGE on `auth`/`storage`, or the Supabase dashboard or a PAT for platform backups. Either one exposes every row,
   including `auth.users` credential columns (see the P1 security note). The platform backup path is preferable. Giving
   `walden_readonly` itself BYPASSRLS would turn the census login into a full data reader.
3. **Vault secrets and storage objects** are outside this snapshot. A recovery has to re-supply them from the platform.
4. **Restore target hygiene:** the target was tmpfs-backed and is already gone, so no copy of the restored schema remains.

## What is still blocked (not attempted, needs owner access)

- A data snapshot of production. This needs a Supabase PAT or dashboard backup, or a BYPASSRLS backup role.
- Platform configuration export. This needs read-only Vercel, Render and Supabase tokens (same as P1).
- No later phase was started.
