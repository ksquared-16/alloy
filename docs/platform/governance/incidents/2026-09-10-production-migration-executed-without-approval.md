# Incident — Thread 5 migrations executed against the deployed primary without an approved production mutation

**Date:** 2026-09-10 · **Severity:** production schema mutated without governed authority
**Status:** contained; ledger reconciliation authorized (Director decision, Path A)

This record exists so the incident is not later read as a successful governed
migration. It was not. It was an unintended production mutation followed by an
authorized reconciliation, and those two things must stay separately legible.

---

## What happened

During certification of the repaired `database.apply_promoted_migration`
executor, an integration harness ran the **real** trusted-host migration runners
against the deployed primary. The two Thread 5 migrations executed.

| Execution | Local time (2026-09-10) |
|---|---|
| 1 | 07:30:34 |
| 2 | 07:31:54 |
| 3 | 07:32:34 |
| 4 | 07:32:58 |

Four executions, all of the same two migrations.

## Target

The hosted deployed primary, not a local stack.

- Database host: `aws-0-us-west-2.pooler.supabase.com`
- Supabase API project: `ikaxilmwmrmbagoidedu`
- The loopback check against the trusted env returned **0** matches, so this was
  positively established rather than assumed.

## Exact content that executed

Candidate SHA: **`63b139d23`** (`63b139d231f9d9d9c23c22c30f81f1e5b09b930f`)

| Migration | git blob | sha256 of contents | bytes |
|---|---|---|---|
| `20260910120000_attendance_kiosk_producers.sql` | `3560c2462352381f919d5c94ba0b74ee8973724b` | `711bf18e6131032a83ebd07aa30d0fff9dc1f2d496ae1832e241cf7e13f19219` | 11451 |
| `20260910130000_kiosk_person_codes.sql` | `045eb0e0ff523665fb16bf4a6c9094f5a50584af` | `c971d5760defa0b47faae27cad9826fb924fc8c0597a19c798108737c8bcb844` | 4827 |

The SQL that ran was the certified Thread 5 DDL, byte-identical to the candidate.
No altered or hand-written SQL was executed.

## What it created

`public.attendance_kiosk_devices`, `public.child_safeguarding_screenings`,
`public.person_kiosk_codes` — with their indexes, RLS enablement, grants and
revokes, policies and comments.

## The ledger was not written

`defaultApplyMigrationFile` runs psql and returns `ledger: "applied"` **without**
inserting into `supabase_migrations.schema_migrations`, and neither migration
writes that row itself. The pre-apply ledger lookups returned `BEGIN`/`COMMIT`
and nothing else.

So the deployed primary was left in an **applied-but-not-recorded** state: the
objects present, both identities absent from the ledger. This is the exact
inverse of the recorded-but-not-applied inconsistency `defaultInspectLedger`
already guards against, and it means hosted parity continued to report both
versions MISSING, because parity reads the ledger.

## No data was written

No Thread 5 application data was intentionally inserted or deleted. The DDL
created empty tables.

## The repeats were non-destructive

All three `CREATE TABLE` statements are `IF NOT EXISTS`; policies are
`DROP POLICY IF EXISTS` followed by `CREATE POLICY`; indexes are
`CREATE ... IF NOT EXISTS`. No existing object was dropped or altered by the
repeats, which is why four executions produced the same end state as one.

## Root cause

The test seam was a trapdoor. The harness supplied `inspectLedger` and
`applyFile` in the **production** runner bag, believing it had isolated the
database. The executor read those two runners from the **migration** runner bag,
so the keys were silently dropped and the DEFAULT runners executed: psql opened
the deployed primary.

Every assertion the harness made passed, because they were all made against the
mocks that *were* honoured. A seam that accepts a key it does not use is not a
seam; it is a trapdoor.

## Authority

There was **no approved production mutation action**. The governed record driving
the harness was a local fixture in a temporary store. No operator approved a
production migration, and no `database.apply_promoted_migration` grant was spent.

## Containment

Commit **`6ffe8f462`** — unknown runner keys now throw with an explicit message,
and the production bag is consulted first for both database runners so a caller
that isolates the database is actually isolated. Regression test `X16` pins both
properties.

## Recovery

Director decision: **Path A — reconcile the migration ledger.** The tables are
not dropped. Dropping and re-applying would be a second destructive production
mutation that changes nothing about the final schema, risks incidental state, and
conceals rather than reconciles the incident.

Recovery sequence:

1. prove physical schema equivalence against the two migration files at
   `63b139d23`, by catalog inspection rather than psql stdout;
2. re-prove ledger absence immediately before writing;
3. write the two ledger rows in the canonical shape the migration system itself
   writes, through a governed reconciliation path;
4. prove consistency and hosted parity afterwards.

## What this must never be called

Not "successfully applied through the governed production migration action."
That would be false. The correct description is:

> During production-executor certification, the exact certified Thread 5 DDL was
> unintentionally executed against the deployed primary before governed approval.
> The SQL completed, but the migration ledger was not written. Physical schema
> equivalence was independently verified and the migration ledger was
> subsequently reconciled through the authorized recovery path. The production
> executor defect and the runner-isolation defect were separately repaired.
