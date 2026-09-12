---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Migration Execution Outcome V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `9619b8992`, with DevOps 10 (`1b6ad61ce`,
carrying DevOps 9–1) merged in.

---

## 1. The defect, and where it lived

`executeProductionMigrationApply` re-reads the hosted ledger after a successful
apply. When the versions are absent it returned `post_apply_verification_failed`
— having just computed the rich outcome `attention_ledger_identity_absent`,
correctly marked `stuck`, and then discarded it behind a generic failure code.
**The code is the value a retry decision reads; the outcome was not.**

Worse, that one code covered **two opposite facts**:

| Condition | Truth | Retrying costs |
|---|---|---|
| ledger could not be re-read | nobody knows whether the schema landed | time |
| ledger read cleanly, versions absent | the schema **is** there, the bookkeeping is not | **a second application of the migration** |

Measured twice:

```
D2   gar_792710a5f553ee  schema landed · reported post_apply_verification_failed
     gar_db1d3588e3fac9  ledger repair 405 → 412
     gar_eefbd899c30b21  census then confirmed parity
W-17 gar_62ef5ea2e363fa  same shape, ledger 412 → 413
```

## 2. What already existed, and was reused

The outcome vocabulary was **already good**. `evaluateProductionApplyOutcome`
distinguishes `blocked_apply_not_run`, `blocked_apply_failed`,
`blocked_recensus_required`, `blocked_recensus_failed`, `blocked_parity_unknown`,
`attention_ledger_identity_absent` and `promotion_released` — and
`classifyApplyFailure` already separates a proven no-effect failure from one that
may have half-run, with the comment *"ambiguity escalates with its evidence and
stops"*.

So this mission added **no second migration authority**. It layered a phase
vocabulary and a retry law over the states that already exist, and fixed the two
places where the distinction was thrown away.

## 3. The phases and the retry law

```
NOT_STARTED → APPLY_STARTED → APPLY_CONFIRMED → LEDGER_RECORDED → VERIFIED

FAILED_BEFORE_APPLY                          → retry_apply      ← the only one
PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE    → repair_ledger
OUTCOME_UNKNOWN_AFTER_START                  → verify_first
VERIFIED_SUCCESS                             → none (terminal)
```

**Exactly one outcome permits re-applying**, and it requires positive proof the
database was never touched — asserted by a control. A generic retry can no longer
turn *schema applied once plus a ledger failure* into *schema applied twice*.

**Two independent questions, never inferred from each other:** did the schema
effect land, and is the identity in the ledger? D2 is precisely the case where
the answers differ, so a resolver deriving one from the other could not have
represented the incident it exists for.

`schemaApplied` and `ledgerPresent` are **tri-state**. `null` means nobody
measured it, and an unmeasured schema after a started apply is UNKNOWN — never an
optimistic retry.

**Fresh evidence wins** over the state recorded at execution time. That is what
lets an outcome recorded as unknown become a partial success once a census proves
the schema landed — the D2 path, where the truth arrived after the action had
already reported.

## 4. The executor now separates the two codes

`APPLIED_LEDGER_INCOMPLETE: "migration_applied_ledger_incomplete"` is new and
distinct. The readable-but-absent case uses it and declares `schema_applied:
true`; the unreadable case keeps `post_apply_verification_failed` and declares
`schema_applied: null`. Both set `retry_apply_allowed: false`.

> **A projection trap, caught before it bit.** `publicProductionApplyResult`
> builds the operator-visible result **by naming fields**, so the new evidence
> would have been computed, carried, and silently dropped before any reader saw
> it — which is exactly what happened to the rich `outcome` during D2. The fields
> are enumerated there now.

An operator and a recovery pass now see `schema_applied`, `ledger_present`,
`ledger_missing`, `hosted_head_before/after`, `retry_apply_allowed`,
`recommended_action` and the full `disposition`.

## 5. Ledger repair: audited, already strong, unchanged

`assertLedgerRepairPreconditions` already requires physical proof that the
effects are present (`missing_physical_state_proof`), exact identity
correspondence against the approved source (`migration_not_in_approved_source`,
`uncanonical_migration_filename`), an unchanged ledger since measurement
(`ledger_head_changed`, `ledger_count_changed`), membership in the measured gap,
ascending order and no duplicates — plus `parity_not_behind`, which refuses a
repair with nothing missing.

That satisfies the contract in full. **Nothing was weakened and nothing was
added**: a repair cannot become a generic way to mark a migration done.

## 6. Parity stays strict

DevOps 6 semantics are untouched. With the schema applied and the ledger missing,
parity **correctly reports the identity missing** — the fix is to repair the
authoritative ledger after proof, not to weaken the gate or re-run the migration.
A control drives the real DevOps 6 gate through both halves: blocked before
repair, green after a proof-backed repair and a fresh census.

## 7. Recovery seam

`migrationRecoveryDisposition` gives DevOps 10 a domain-specific answer in the
same vocabulary: retryable, ledger-repair-required, verification-required, or
terminal — routing to `database.repair_migration_ledger` or
`database.read_census`, never back to an apply. The general DevOps 10 law
(`STARTED_UNKNOWN` is never replayed) and this domain's law are asserted to agree.

## Certification

`migration-execution-outcome` — **24 passed, 0 failed**, covering cases A–J and
both real incident replays. D2 and W-17 both now classify as
`PARTIAL_APPLY_CONFIRMED_LEDGER_INCOMPLETE` with `retry_apply_allowed: false` and
`recommended_action: repair_ledger` — which is exactly what `gar_db1d3588e3fac9`
and `gar_62ef5ea2e363fa` actually did.

`production-apply-executor` — **48/0**. Its `X12b` and `X12c` previously asserted
the **same code for the two opposite cases**, which was the defect written into a
test. They now pin the distinction; X12b's guarantee ("is not a pass") is
unchanged.

Regression green: `development-production-apply-owner` 28/0,
`development-migration-parity` 37/0, `development-ledger-repair` 25/0,
`development-ledger-repair-executor` 5/0, `certification-ledger-routing` 16/0,
`certification-aware-migration-target` 18/0, `development-reconciliation-apply`
28/0, `control-plane-resilience` 46/0, `toolchain-canary` 49/0,
`host-maintenance` 50/0, `promotion-train` 63/0, `agent-configuration` 31/0,
`development-health` 30/0, and the DevOps 1–5 contracts (17/22/27/22/23).

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No toolkit installed, no Gateway
restarted, no hosted schema touched, no live ledger repaired, no product
migration modified, soak evidence untouched.

## Remaining debt

- **The resolver is not yet called by the recovery loop.** The seam exists and is
  proven; `control-plane-recovery` still classifies migrations through the
  general `STARTED_UNKNOWN` rule, which is correct but coarser than the
  domain-specific answer now available.
- **`attention_ledger_identity_absent` is reachable only from the production
  apply path.** The staging apply path (`database.apply_migration`) has the same
  shape available but was not re-pointed in this mission's bounds.
- **No automated route from partial success to the repair action.** The
  disposition names `database.repair_migration_ledger`; filing it is still an
  operator step, deliberately, since the repair needs its own physical-state
  census as proof.
