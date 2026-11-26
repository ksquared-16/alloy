# The acquisition, its security model, and what it refuses to decide

## Why one acquisition

Deployed instrumentation at `268fc0770` measured the subjects branch as **six sequential remote
waves over twelve households**:

| wave | offset | gap |
|---|---|---|
| `households_1p_n12` | 122 ms | +122 |
| `members` | 243 ms | +121 |
| `pl_placements_n7` | 360 ms | +117 |
| `pl_instances` | 482 ms | +121 |
| `pl_programs` | 582 ms | +100 |
| `pl_rooms` | 679 ms | +97 |

Mean **113 ms per wave**. `assemble` — turning all of it into rows — measured **0.2 ms**. The cost
follows the number of round trips, not the number of rows, and waves two to six exist only because
each read needs ids the previous read returned. The database already holds those ids.

## What it is

`public.financials_account_subject_facts(p_org_id uuid, p_scan_cap integer, p_enrollment_process_key text)`
returning `jsonb` with ten named row sets: `households`, `members`, `agreement_sites_direct`,
`agreement_sites_orphan`, `orphan_members`, `contacts`, `placements`, `enrolment_intents`,
`program_labels`, `room_labels`. No mystery blob — each is a named set with named columns, and the
inventory in `fact-inventory.md` maps every one to the application authority that consumes it.

## What it refuses to decide

The columns the application rules read travel **deliberately**, so the rules keep running where
they already live:

| rule | stays in | the column that travels |
|---|---|---|
| site visibility | `isFinancialSubjectVisible` | `site_location_id` |
| membership and order | the cohort resolver | rows arrive ordered `(name, id)` |
| scan cap and `truncated` | the cohort resolver | the acquisition returns `cap + 1` |
| a child's activity | `childNamesFrom` | `is_active` |
| contact eligibility | `readContactNames` | `role_type`, `status`, `end_date` |
| placement liveness | `readCurrentPlacements` | placement `status` |
| program precedence | `readCurrentPlacements` | intents for **every** member, unfiltered |
| label fallback | `readCurrentPlacements` | both `label` and `key` |

Two of these are worth naming as deliberate refusals. **Enrolment intents come back for every
member**, not only the unplaced ones, because narrowing to the unplaced *is* the placement-first
precedence rule, and it belongs to the module the scheduling route already named as its owner.
And **truncation is returned as a row, not a verdict**: the acquisition hands back `cap + 1`
households and the caller reads the extra row as "there were more", exactly as its paged loop did.

## Security

Matching the posture the account fact bundle established, and censused against the live catalog
before it was written (`financials_account_fact_bundle` is `prosecdef = false` with
`search_path=public, pg_temp`):

- **SECURITY INVOKER.** The caller is the route's service-role client. A `SECURITY DEFINER` version
  would silently remove the RLS the invoker is subject to.
- **Pinned `search_path = public, pg_temp`.**
- **An org predicate on every statement.** Eleven `org_id = p_org_id` predicates across twelve
  table reads, plus the `persons` join scoped in its `ON` clause. A call for the wrong org returns
  empty arrays, never another tenant's rows.
- **No authorization decision inside.** The route decides `fin.read` through
  `requireFinancialsCapability` **before** the acquisition runs, so an unauthorized caller never
  reaches the database. Its test file proves exactly that and stubs the acquisition rather than
  the gate.
- **EXECUTE revoked** from `PUBLIC` and from `authenticated`, granted to `service_role` only.
- **All nine source tables carry `org_id`**, confirmed by census rather than assumed.

## The two clocks

A migration reaches the database through governed authority; the code that calls it reaches staging
through a deploy. Between those events the new route runs against a database that has never heard
of the function.

`PGRST202` (PostgREST) and `42883` (Postgres) mean *not there yet* and degrade to the original
six-wave acquisition — same facts, more round trips. **Everything else still fails closed**: a
permission refusal, a statement timeout or a connection reset throws, because degrading those to
the slow path would hide a broken database, and returning an empty cohort would render as an
organisation with no households.

## Migration guard

The hosted high-water was censused immediately before the version was chosen: `20261025120000`,
495 applied, with no local migration beyond it. `20261026120000` therefore collides with nothing,
which is what prevents the silent false skip where an apply reports success and the newer file
never runs.
