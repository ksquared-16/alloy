# PARTICIPATION LIFECYCLE — ONE TRANSACTION

**`692bd6ec0`.** The participation lifecycle write now happens inside a transaction Step 2 can extend.
The port's direct UPDATE is gone, not retained as a fallback.

---

## WHAT WAS WRONG

`update_process_participation` is classified `dependent` — it sequences *after* the atomic identity
group and is not part of `execute_processing_identity_group`. **That classification is correct and is
not changed here.** But it left the lifecycle write with no transaction of its own: the TypeScript port
issued a bare UPDATE. Step 2 therefore had nowhere to put a maintained opportunity fact without
risking a split commit — canonical truth moving while the fact derived from it did not.

## THE BOUNDARY

`update_participation_and_maintain_facts` is that transaction and nothing more. A plpgsql function body
**is** one transaction, so when Step 2 adds its UPDATE at the named seam, either both commit or neither
does.

| | before | after |
|---|---|---|
| lifecycle write | bare `supabase.from("process_instances").update(...)` | inside one plpgsql transaction |
| transaction available to Step 2 | **none** | **the seam, named in the function** |
| production lifecycle writers | 1 | **1 — unchanged** |
| command classification | `dependent` | **`dependent` — unchanged** |

## SEMANTICS PRESERVED, NOT IMPROVED

Including one nuance worth naming: **the stage-entry stamp keys on `stage_key` being SUPPLIED, not on
the value changing.** Re-sending the same stage restamps `stage_entered_at` today. That is preserved
exactly — this slice moves a boundary and changes no behaviour, and "fixing" it would have been an
unrequested change riding inside infrastructure work.

Also carried across unchanged: the optimistic-concurrency predicate (absent when no expected version is
given), the `record_not_found_or_stale` / `stale` vocabulary, not-found and stale remaining one
outcome, and the org predicate.

## NOT A TABLE WRITER

Exactly two settable fields, each with a **supplied-flag** — because `null` means SET NULL while absent
means LEAVE ALONE, and one nullable parameter cannot express both. No patch language, no column list,
no reachable third column. The command above the port only ever sends `stage_key` and `state`, so the
port now **refuses** anything else rather than silently dropping it.

**`SECURITY INVOKER`, deliberately.** `process_instances` carries RLS org policies; a `DEFINER`
function would bypass them and quietly become a privilege escalation for any caller who could reach it.
INVOKER leaves every existing authorization exactly as strong as it is.

## PROOF BY EXECUTION, NOT BY TEXT

The migration certifies itself. Seven specimens against real rows, each raising on mismatch:

| # | specimen | asserts |
|---|---|---|
| 1 | state-only update | applied; stage untouched; **`stage_entered_at` NOT stamped** |
| 2 | stage change | applied and stamped; unsupplied `state` not overwritten |
| 3 | stale `expected_version` | refused **and the row unchanged** |
| 4 | current version | accepted — proves 3 failed on staleness, not on a guard that always refuses |
| 5 | missing row | same vocabulary, nothing invented |
| 6 | cross-org id | refused; row unchanged |
| 7 | **forced failure after the UPDATE** | **row unchanged after rollback** — the proof Step 2 can add a second UPDATE without a split commit |

Every fixture is discarded by the enclosing exception frame; a real assertion failure re-raises and
fails the migration.

## CERTIFICATION

**13 gates.** All six planted defects bind, each verified at the mutated line: the direct write
returning; the concurrency predicate removed; stage entry no longer stamping; the rollback specimen
dropped; the RPC becoming generic patch CRUD; the command reclassified `atomic`.

**Regression: 44 files, 429 tests, zero failures** across `tests/processing`, `tests/mutations`,
`tests/enrollment`, `tests/records` — including the Processing Identity suites that exercise this port.

`typecheck` rc=0 · `typecheck:tests` rc=0, both on `692bd6ec0`.

**Two gates of mine needed repair, and the plants found both.** The migration scan first asserted
against the file's own prose — the comment explaining *why not* `SECURITY DEFINER` read as the
forbidden thing. Stripping comments then broke the seam check, because the seam marker is a comment by
nature. Code checks now read the stripped text and the seam check reads raw. This is the second time a
comment-vs-code scan has produced a false reading; the pattern is worth distrusting on sight.

## NO PERFORMANCE CLAIM

Serial depth remains **3**, request-time reads remain **3**. No maintained fact exists yet. This is
mutation-authority infrastructure required for Step 2's correctness, and it buys no latency.

## STEP 2 HANDOFF

1. The seam is inside `update_participation_and_maintain_facts`, named in the function.
2. Step 2 adds the maintained-fact UPDATE **there** — same transaction, no second writer.
3. Still required and unchanged: maintain the **raw** participant facts, not the rollup, because
   `inherits_context_stage: true` makes the effective result depend on `opportunities.stage_key`.
4. The dedicated column remains **unauthorized and uncreated**; a gate asserts no
   `ALTER TABLE opportunities` appeared here.
5. Scoped callers keep request-time `allowedLocationIds` filtering.
