# Runtime Actuation V1 (R3) — Sprint Closeout

> **Status:** Certified and promoted to `staging`. Canonical doctrine lives in
> [`scripts/local-dev/RUNTIME-ACTUATION.md`](../../../../scripts/local-dev/RUNTIME-ACTUATION.md) —
> this closeout records the sprint outcome and evidence; it does **not** restate doctrine.
> Companion: [`runtime-actuation-v1-plan.md`](runtime-actuation-v1-plan.md) (discovery + design).

## Mission and scope

Implement **Runtime Actuation V1 (R3)** — the bounded executor beneath Director in the
`observe → declare → actuate` model. Given an already-admitted Runtime Intent (R2), R3
re-invokes the authoritative R2 evaluator live, reserves capacity for a dedicated provision,
claims it for one bounded attempt, dispatches an allowlisted provider operation, and confirms
the result through authoritative R1 observation. R3 owns execution, never policy. Scope was
frozen to V1: one provider (Supabase/local-Docker), the operations
`provision · attach · detach · retire · reconcile`, and no Director/UI/scheduler.

## Final ownership map (one owner per concern)

| Concern | Owner |
|---|---|
| Resource identity + registration | R0 (`lib/runtime-core.sh`; `alloy-runtime-register`) |
| Observed resource state | R1 (`lib/runtime-core.sh` / `alloy-ro`) |
| Desired state + **policy** + admission | R2 (`lib/admission-core.sh`) — sole policy owner |
| Reservation, execution, attempts, adapter dispatch, verification judgement | **R3** (`lib/actuation-core.sh` + `lib/actuation-exec.sh` + adapters) |
| Sequencing, approval, orchestration retry, replacement intents | Director (out-of-repo) |

## Implemented R3 boundary

Control plane (`actuation-core.sh` + `actuation-exec.sh`) is separate from the data plane
(allowlisted adapters). R3 re-invokes R2 live before reserving (no policy duplication), never
sequences missions or decides retries (Director's), and never treats a zero provider exit code
as success — success requires independent R1 verification. New surfaces:

- **Mutating executor** (outside `alloy-ro`): `alloy-runtime-actuate <wt> --operation <op> --mission <key> [--adapter supabase|fixture] …` with full identity safety (slot-only refused; mission/manifest/branch/path must match).
- **Read-only inspection**: `alloy-ro runtime-reservations` / `runtime-executions [<id>]` / `runtime-actuation-capacity` (single-sourced into the read-core verb set; constitution test green).
- **Adapters**: a hermetic `fixture` adapter (edits the R1 fixture so verification observes results; refused outside a fixture/cert root) and a real `supabase` adapter (isolated project + free ports, durable ownership marker, provider output discarded, bounded, no auto-SIGKILL).
- **Records** (parsed-never-sourced, atomic): `reservations/`, `executions/` (+ append-only `.log`), `attachments/`, locks under `locks/runtime-actuation/`.

## Operation semantics

`provision` (dedicated; reserves R2's `capacity_required`; registers identity via R0; verifies via R1) ·
`attach`/`detach` (control-plane relationship only — never mutate the shared runtime; detach of a
dedicated attachment fails closed) · `retire` (ownership-proven via registry owner==mission +
dedicated class + adapter ownership record; verifies absence via R1; never retires shared/foreign) ·
`reconcile` (bounded: adopt/release/classify via R1; never re-provisions, re-interprets, or overrides R2).
Selective reservation accounting: only a dedicated provision reserves capacity. Reservation TTL 300 s
(code-owned). Claim liveness = PID-alive AND enforced lease.

## Concurrency defect found and corrected (C-0)

The first independent architecture review found a **blocker (C-0)**: the per-resource lock was
acquired *after* the idempotency/reserve phase, so two concurrent same-intent deliveries shared
`exec_id`/`ns`/`rid`, and the lock-loser mutated the winner's in-flight reservation/execution →
capacity over-commit + audit corruption. **Correction:** the per-resource lock is now acquired in
`alloy_act_execute` **before** the entire critical section (idempotency → reserve → claim → dispatch);
a same-resource concurrent delivery that cannot take the lock returns `already-in-progress` and
mutates nothing. C-1 (retryable/`timed_out` redelivery now reconciles via R1 first, never silently
re-dispatches) and C-2 (the claim lease is now enforced on both the reservation and execution head as
a PID-reuse backstop; lease 600 s > provision timeout 420 s) were corrected in the same pass.

## Lock TOCTOU defect found and corrected

The new **concurrent certification** exposed a deeper defect in the lock primitive itself:
`alloy_act_lock_acquire` reclaimed a lock whose winner had `mkdir`'d the dir but not yet written
`owner.env`, letting two processes both "hold" it (observed deterministically as an 8-container
double-provision). **Correction:** a bounded grace window for `owner.env` to appear before concluding
staleness; a genuinely crashed-mid-init lock remains reclaimable; `rm -rf` is confined to the
code-owned lock root (slug maps `/`,`.` → `-`); release removes only when the owner PID is this process.

## Final certification evidence

- **R3 actuator suite** (`tests/test-runtime-actuator.sh`): **43/43**, stable across 5 consecutive
  runs. Includes the permanent concurrent-delivery certification (deterministic non-mutating loser +
  genuine two-process parallel launch → one runtime, one reservation, one execution head, one winner).
- **Full Phase 4** (`tests/run-phase4-tests.sh`, R0–R3 + engineering + product + syntax/static checks):
  **PASS=80, FAIL=0.**
- Registry/inspection (R0/R1), admission (R2), alloy-ro constitution, and read-core parity: all green;
  R3 read verbs single-sourced across read-core ↔ capability manifest ↔ dispatcher.

## Real local-Docker isolation evidence

`tests/cert-runtime-actuator-local-docker.sh`: **13/13** against a newly created isolated namespace
(`alloy-r3-r3cert-init-*`) — provision → R1 observes active+healthy → R3 verification confirms →
duplicate creates **no** second runtime → ownership-proven retire → docker removal + R1 absence →
**no canonical/foreign runtime changed** (`6lmr`, `Alloy`, `alloy-processing-identity-cert`,
`alloy-runtime-realization` intact). Teardown trap left nothing running; post-run: 0 leaked containers,
no leaked dirs, cert fully isolated from the real runtime root.

## Known V1 limitations

- Single provider (Supabase/local-Docker); generic pause/resume/restart deferred (unauthorized by
  current admission next-actions).
- Retire leaves the R0 registry record as `orphaned` (R0 semantics); orphaned-record cleanup is a
  Director/operator follow-up (R3 does not delete R0 files).
- Locking is single-host filesystem `mkdir` + PID/lease liveness; distributed/remote execution is out
  of scope for V1.
- Bounded execution uses a pure-bash timer with no auto-SIGKILL; an over-deadline provider is classified
  `timed_out` and left for reconcile.

## Deferred advisory items (tracked separately, not part of this promotion)

1. Assert/derive that the claim lease exceeds the maximum provider timeout (guard against a future
   `PROVISION_TIMEOUT` increase past the lease).
2. Optional deterministic lock-initialization-delay test for the TOCTOU (currently proven
   deterministically via the held-lock loser test; the parallel path exercises it probabilistically).
3. Unreachable `cancelled` execution state (declared, no V1 cancel path).
4. Capacity-formula cleanup (consume R2's `_AD_REMAINING` instead of restating `max − active`).
5. Minor fixture-guard hardening and read-emitter module separation.

## Confirmation: R0–R2 behavior intact

R3 is purely additive. The R0/R1/R2 core files (`lib/runtime-core.sh`, `lib/admission-core.sh`,
`alloy-runtime-register`, `alloy-runtime-intent`) were **not modified** (empty `git diff` vs base
`c6836c595`). The only shared-core touch is an additive verb-list constant in `read-core.sh`. Full
R0–R2 regression remained green throughout.

## Exact final commit

Promotion candidate (independently reviewed): **`94a1c9dd46042ec29f2be740f007b71a8da25929`**
(`agent/claude/6-runtime-actuator-r3`), base `c6836c595`. This closeout adds one further docs commit;
the certified code is unchanged at and below `94a1c9dd4`.
