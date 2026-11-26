# FINANCIALS_ACCOUNTS_COHORT_PERFORMANCE_DEPLOYED_CERTIFIED

Deployed `2ed2a31e6ffa6a5040029377a149391f8b2358d4` · staging · `nodeEnv: production` ·
database `ikaxilmwmrmbagoidedu`.

## The target

| | before `258aa858c` | after `2ed2a31e6` | target |
|---|---|---|---|
| **cold click → interactive list** | 1,432 ms | **864 ms** | <1,000 ms ✓ |
| **warm** | 101 ms | **83 ms** | <500 ms ✓ |
| cold rows visible | 1,431 ms | **862 ms** | |
| cold selected-account truth | 2,683 ms | 2,599 ms | |
| ledger rows, every opening | 116 | 116 | |

Preferred cold (<750 ms) is **not** met at 864 ms. The required <1,000 ms is.

## What moved, and what did not

| | before | after |
|---|---|---|
| subjects **server** | 679.7 ms, six waves | **131.9 ms, one wave** |
| subjects wire | 1,250 ms | 746 ms |
| position server | 633 ms, four waves | 602.6 ms, four waves — untouched |
| position wire | 1,159 ms | 1,138 ms |

Subjects' interior after the repair: `acquire` at 129.4 ms, and then **every** downstream phase
between 0.0 and 0.4 ms — `households_1p_n12` 0.4, `sites_direct` 0.2, `members` 0.4,
`pl_placements_n7` 0.0, `pl_instances` 0.1, `pl_programs` 0.0, `pl_rooms` 0.0, `assemble` 0.2.
Six sequential round trips became one, and the rest is arithmetic over rows already in hand.

**Position was not optimised at all**, and did not need to be: all five cold openings became
interactive *before* position landed. The list waits on subjects (746 ms wire) and position
arrives afterwards (1,138 ms) to decorate rows it cannot add, remove or reorder.

## Parity — old acquisition vs new, on the real tenant

Captured from the deployed subjects endpoint before the cutover and after it:

- row count 12 → 12
- identities **and order** identical
- **field differences: 0**
- program vocabulary identical (3), room vocabulary identical (2)
- childNames identical (40 values), contactNames identical (16), siteLocationIds identical (13)
- `truncated` false → false, `scanCap` 2000 → 2000, scope unchanged

## The three-state contract, proven on screen

| state | renders | row height |
|---|---|---|
| `not_yet_known` | `—` | 83 px |
| `known_zero` | `$0.00` | 83 px |
| `known` | `$2,218.82` | 83 px |

Desktop (1440) and phone (400), reserved and settled, all at **83 px** — no layout jump — and
**0 px horizontal overflow** at both widths. Reserved rows report `disabled: false`: they are
choosable while their money is still unknown.

The trap this closes: `accountState` read position money through four branches and ended in a bare
`return noActivity ? "no_activity" : "settled"`. A row whose position had not arrived carried
zeros, fell past every branch and came out **settled** — so a household owing $2,023.87 would have
worn a Settled chip and dropped out of the Outstanding filter while doing it.

## Security, physically proven on the hosted database

```
name              financials_account_subject_facts
args              p_org_id uuid, p_scan_cap integer, p_enrollment_process_key text
security_definer  false                      <- SECURITY INVOKER
settings          search_path=public, pg_temp
acl               postgres=X/postgres, service_role=X/postgres
```

No `PUBLIC`, no `authenticated`. Eleven `org_id = p_org_id` predicates over twelve table reads,
with `persons` scoped in its join. No authorization decision inside: the route answers `fin.read`
through `requireFinancialsCapability` **before** the acquisition runs. Ledger:
`20261026120000` applied, 496 total (was 495), chosen against a censused high-water of
`20261025120000` so nothing collided.

## Correctness

116 ledger rows on both hosts. CURRENT BALANCE $2,023.87 · DUE $1,912.00 · PAST DUE $1,525.00 ·
RESPONSIBILITY $2,098.87 · PAID $75.00 · AVAILABLE PREPAID $125.00. Row identity differences 0.
KPI host differences 0. Drift from pre-perf literals 0. All 12 account identities and their order
unchanged.

## Carried forward

**§27 — PROGRESSIVE_DETAILS_FLOOR_RECOMMENDED.** Interactive list → selected-account truth was
1,251 ms and is now **1,735 ms**. It grew because the list got faster while the selected account
did not: the floor is now the most visible remaining wait on this surface. Not implemented here.

**§28 — connection-latency residual, unchanged and not ours.** Subjects spends 131.9 ms on the
server and 746 ms on the wire; position 602.6 ms and 1,138 ms. That is **535–614 ms per request**
of connection and round-trip latency, materially identical to the 526–533 ms measured before, and
identical on a 4.2 KB body and a 52.9 KB one. It now dominates the cold path and bounds any
further cold target at roughly 700 ms.

`SHARED_AUTH_CARD_CONSOLIDATION_FOLLOWUP` (~220 ms) and
`FINANCIALS_OPEN_COLLECTIONS_CHARGE_CAP_CORRECTNESS` carried untouched. `perm` measured 0.3 ms.

Human QA remains **ZERO / 44**, not started.
