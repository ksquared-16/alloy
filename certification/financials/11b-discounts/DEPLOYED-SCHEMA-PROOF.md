# Items A, B, C — proved on the deployed database

`database.read_census` · `gar_606fa99dcc3786` · target `alloy_deployed_primary` ·
query hash `b51e1d94f54fd4f0ab3737df28dac8589f096f0ec75577ef060a395d69722216` ·
run at 2026-09-20T19:26:43Z, against deployed build `6c1b84fdc`.

## A — the migration applied

`database.apply_migration` (`tha_d7557b219669c3`) returned `ok: true`, `stopped: false`,
`idempotent: true`, `ledger: "applied"` at 19:15:22Z for `20260924120000`, against
`expectedSha 6c1b84fdc` with `stagingRelation: equals_staging`.

**That is a label, so it was not taken as the proof.** The census read
`supabase_migrations.schema_migrations` directly: `migration_in_ledger → 20260924120000`.

## B — the table exists

`table_exists → commercial_policy_exceptions`. Not an empty answer, so the
"wrong database vs genuinely absent" ambiguity does not arise.

## C — constraints, index, trigger, tenancy

| check | deployed answer | holds |
|---|---|---|
| `reason` NOT NULL | `is_nullable=NO` | yes |
| `reason` non-empty | `CHECK ((length(btrim(reason)) > 0))` | yes |
| live-row index is PARTIAL | `CREATE UNIQUE INDEX ux_commercial_policy_exceptions_live … (org_id, policy_id, opportunity_customer_member_id, effective_start) WHERE (superseded_at IS NULL)` | yes |
| org-parity trigger enabled | `trg_enforce_commercial_policy_exception_org_parity (O)` | yes |
| `policy_id` restricts delete | `commercial_policy_exceptions_policy_id_fkey confdeltype=r` | yes |
| relationship cascades | `commercial_policy_exceptions_opportunity_customer_member_i_fkey confdeltype=c` | yes |
| `org_id` NOT NULL | `is_nullable=NO` | yes |

The index being **partial** is the load-bearing detail. A plain unique index would forbid a
superseded row from coexisting with the live one that replaced it, which is the whole supersession
model — so the census asserts the `WHERE` clause, not merely the index's existence.

## One row's boolean is false, and it is my error, not the schema's

`columns_present` asserted `count(*) = 12`. The deployed table has **14**:

```
id, org_id, policy_id, opportunity_customer_member_id, customer_member_id,
effective_start, effective_end, supersedes_exception_id, superseded_at, reason,
created_by, created_at, ended_by, ended_at
```

I omitted `ended_by` and `ended_at` when writing the expectation. Every column the model requires
is present and the two I forgot are the ones that record who ended an exception — so the detail
proves the schema is complete and correct while that boolean reports my arithmetic. The query
file is left exactly as it ran, because its hash is the provenance of this result; the count is
corrected in a follow-up rather than by editing the artifact this census is evidence for.

## What this settles about item D

`D` was measured separately on the deployed build: the forecast route answered `200` with the
`exceptions` key present. On its own that was **not** conclusive — the runtime deliberately
absorbs `42P01`/`PGRST205` and returns an empty list, so a 200 could have meant "no table". The
census removes that ambiguity: the table exists, so the read ran.
