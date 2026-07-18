# Runtime Actuation V1 (R3)

> **Actuation realizes an already-admitted intent — it does not decide policy.**
> This is the **ACTUATE** phase of *observe → declare → actuate*. Given a recorded
> Runtime Intent, R3 re-invokes the authoritative R2 evaluator **live**, reserves
> capacity for a dedicated provision, claims it for one bounded attempt, dispatches
> an **allowlisted** provider operation, and confirms the result through **authoritative
> R1 observation**. A zero provider exit code is **not** success — R1 verification is.

R0/R1 gave the toolkit read-only **observation**; R2 turned posture + observed capacity
into a deterministic admission **decision** that *reserves nothing*. R3 is the first phase
that **acts on** infrastructure — the bounded executor beneath Director.

## Ownership (one owner per concern — the law)

| Concern | Owner |
|---|---|
| Resource identity + registration | **R0** (`lib/runtime-core.sh` registry; written via `alloy-runtime-register`) |
| Observed resource state | **R1** (`lib/runtime-core.sh` / `alloy-ro`) |
| Desired state + **policy** + admission decision | **R2** (`lib/admission-core.sh`; the sole policy owner) |
| Reservation, bounded execution, attempts, adapter dispatch, **verification judgement** | **R3** (`lib/actuation-core.sh` + `lib/actuation-exec.sh` + adapters) |
| Sequencing, operator approval, orchestration-level retry, creation of replacement intents | **Director** (out-of-repo) |

R3 **consumes** R0/R1/R2; it never re-derives posture, isolation class, capacity policy,
admission, or reason codes, and it is **not** a second Director. Calling the R2 evaluator
immediately before reservation is **required** and is not policy duplication; re-implementing
its logic would be.

## The atomic sequence

```
Runtime Intent & Admission (R2, recorded intent)
  → live R2 re-evaluation (authoritative; must return admitted-* and be fresh)
  → R3 reservation / capacity claim   (dedicated provision only)
  → R3 execution lifecycle (one bounded attempt, per-resource lock)
  → allowlisted adapter operation      (data plane)
  → authoritative R1 observation
  → R3 verification result             (desired state reached? — the judgement)
```

Concretely, one actuation runs: **1** load the persisted intent · **2** validate intent
identity + freshness · **3** invoke the R2 evaluator live · **4** confirm the requested
operation is in the returned `allowed_next_actions` · **5** under a durable lock, confirm
the capacity opportunity still exists and write the reservation · **6** claim it for one
attempt · **7** dispatch the bounded adapter op and verify via R1. If the capacity
opportunity disappears before the reservation is written, or admission no longer holds,
R3 returns a typed `conflict` / `stale-admission` result — it never silently re-evaluates
and chooses another posture or target.

## Operations (distinct owners; never flattened into equivalent provider calls)

| Operation | What it is | Reserves capacity | Data-plane? |
|---|---|---|---|
| `provision` | realize a runtime for an admitted **dedicated** (or new-shared) decision; register identity via R0; verify via R1 | **yes** (the R2 `capacity_required` value) | yes (adapter) |
| `attach` | record a worktree→runtime **relationship** for `admitted-shared-existing`; never creates/starts/stops/mutates the shared runtime; consumes no dedicated slot | no | **no** (control plane) |
| `detach` | remove a (shared) worktree→runtime relationship; fails closed if it would orphan an ownership state requiring Director policy | no | **no** (control plane) |
| `retire` | tear down an **ownership-proven** dedicated runtime this lineage created; verify absence via R1; release capacity once the result is known | no new slot | yes (adapter) |
| `reconcile` | resolve an incomplete/ambiguous attempt via R1; complete bookkeeping when evidence is conclusive; release abandoned reservations; classify for Director retry | no | no |

**Attach/detach are control-plane relationship operations, not provider lifecycle
operations.** `reconcile` is **not** a general repair command: it never creates a
replacement intent, reinterprets desired state, re-runs a destructive action, chooses a
different target, silently provisions a replacement, overrides R2 admission, or turns
ambiguity into success. Internal **verification** is an execution *phase*, not a separately
invokable mutation.

## State: four distinct concepts

`intent/admission state` · `reservation state` · `execution/attempt state` · `observed
resource state` are kept separate. **A provider exit code of zero is not success.** Success
requires (1) the adapter reports completion, (2) R1 *independently* observes the target, and
(3) R3 verification determines the observation satisfies the exact admitted desired result.
Provider success + failed verification ⇒ `verification-failed` / `desired-state-not-reached`,
never success. R3 invokes R1 and compares; it does **not** build a second inspection engine.

**Reservation lifecycle:** `held → consumed | expired | released | conflict`.
**Execution lifecycle:** `pending → claimed → executing → verifying → succeeded | failed |
timed_out | conflicted | cancelled | stale`. `timed_out` is an *ambiguous* terminal that
remains reconcilable via R1.

## Identities (five explicit roles; deterministic, never time-based)

- **Intent identity** — immutable content fingerprint of the recorded R2 intent.
- **Execution identity** — deterministic for (this admitted intent, operation, resource,
  admission shape). Duplicate delivery ⇒ same id ⇒ idempotency.
- **Attempt identity** — unique per bounded attempt (`<execution-id>.a<N>`).
- **Reservation identity** — the capacity claim for (intent, resource).
- **Resource identity** — the canonical R0 namespace (never a provider name alone); minted
  deterministically for a not-yet-existing dedicated runtime so duplicates target the same
  namespace, never a new one.

A repeated request for an already-**succeeded** execution returns the prior terminal result
with **no** repeated provider effect. A repeated request while the same execution is active
returns `already-in-progress` and **mutates nothing** (the per-resource critical section —
idempotency, reservation, claim, dispatch — is serialized under one durable per-resource
lock). A redelivery of a *retryable/ambiguous* terminal (e.g. `timed_out`) is **reconciled
via R1 first and reported**; R3 never silently re-dispatches a provider mutation — a genuine
retry is Director's explicit decision, not an automatic effect of redelivery.

## Reservation & capacity (selective accounting)

R3 does **not** duplicate the R2 capacity formula. A capacity-consuming reservation is
required **only** for an operation that creates/claims an additional runtime counted by R2
capacity policy (a dedicated `provision`); its unit count is exactly R2's `capacity_required`.
`attach`/`detach`/`retire`/`reconcile` reserve **no** new slot. R3 adds a read-only,
reservation-aware overlay on top of R2's max/active: `effective_remaining = max(0, max −
active − live_held_reservation_units)`, so two contenders cannot both win one slot.

### Reservation TTL

Default **300 s** (code-owned toolkit setting `ALLOY_ACT_RESERVATION_TTL`, bounded 30..3600;
never tenant/intent configuration). Semantics: TTL applies to an *unclaimed or demonstrably
abandoned* reservation; a claimed execution is kept live by a durable claim identity —
**PID liveness AND an enforced claim lease** (a claim counts as live only while its PID is
alive and its lease has not elapsed, which bounds a reused-PID false-live claim) — so it is
**not** made available for duplicate execution merely because the original reservation
timestamp elapsed. **Reservation expiry frees capacity bookkeeping only** — it
does not mark an execution successful, cancel or kill a provider process, authorize teardown,
or trigger a retry. An expired reservation tied to an ambiguous provider result enters
reconciliation. Time is injectable for tests (`ALLOY_ACT_EVAL_NOW`).

## Durable locking & concurrency

Durable filesystem `mkdir` locks with PID-staleness (survive process restart; PID reuse alone
does not establish ownership — an owner record carries the key + start time, and a stale lock
requires the recorded PID to be provably dead). At most one active claim per execution
identity and one mutating execution per target resource; capacity reservation for dedicated
provisioning is atomic under a capacity lock. Two contenders for one slot ⇒ exactly one wins.

## Adapter boundary (no arbitrary command channel)

Provider-specific actuation sits behind a canonical adapter. There is **no generic shell
adapter and no arbitrary-command argument**: an adapter constructs only fixed, allowlisted
argv and validates every interpolated value (the namespace must be R3-minted). The intent,
persisted state, Director input, and CLI **never** supply shell fragments, command names,
Docker args, compose paths, or arbitrary environment variables. Provider output (which
contains keys) is **discarded** — redaction by construction; records hold typed result
classes, never provider stdout, secrets, tokens, or command text.

- **fixture adapter** — hermetic; edits the R1 observation fixture so verification observes
  simulated results. Refused outside a fixture/cert root.
- **supabase adapter** — real; creates an isolated project (own `project_id` + free ports),
  marks ownership durably, runs `supabase start/stop --workdir <validated-dir>`, bounded in
  time with **no** automatic SIGKILL.

Director eventually replaces the actuator *implementation*; the intent contract and this
boundary remain unchanged.

## Failure taxonomy (typed — never one generic string)

`invalid-execution-request · intent-not-admitted · stale-admission · target-not-found ·
unsupported-operation · resource-conflict · execution-already-in-progress · provider-unavailable
· provider-rejected · timeout · ambiguous-provider-result · verification-failed ·
desired-state-not-reached · non-retryable-invariant-violation · internal-execution-failure`,
plus reservation `reservation-conflict · reservation-capacity-exhausted · reservation-expired`.
Each terminal failure carries `retryable`; `timeout`/`ambiguous-provider-result` are never
auto-resolved to success.

## Commands

Mutating executor (OUTSIDE `alloy-ro`, like `alloy-runtime-register`/`-intent`; full identity
safety — a bare slot number is refused, mission/manifest/branch/path must match):

```
alloy-runtime-actuate <worktree> --operation <provision|attach|detach|retire|reconcile>
                      --mission <key> [--adapter supabase|fixture]
                      [--expect-branch B] [--expect-path P] [--reservation-ttl N] [--json]
```

Read-only inspection (`alloy-ro`; safe under `Bash(alloy-ro *)`):

```
alloy-ro runtime-reservations          # capacity reservations (control-plane claims)
alloy-ro runtime-executions [<id>]     # execution lifecycle records
alloy-ro runtime-actuation-capacity    # reservation-aware capacity overlay
```

## Records (parsed, never sourced; written atomically)

Under the single runtime root: `reservations/<id>.env`, `executions/<id>.env` (+ `.log`
append-only event trail), `attachments/<worktree>.env`, and per-resource/execution/capacity
locks under `locks/runtime-actuation/`. Records contain no secrets or provider output.

## Verification

- `tests/test-runtime-actuator.sh` — hermetic (fixture adapter): all 13 required
  demonstrations, reservation exhaustion/expiry/selective-accounting, idempotency,
  concurrency, timeout, crash/reconcile, identity safety, adapter-allowlist, redaction,
  `alloy-ro` read-only, and a no-docker/supabase-mutation proof. Runs in `run-phase4-tests.sh`.
- `tests/cert-runtime-actuator-local-docker.sh` — **real** local-Docker certification:
  provisions an isolated namespace, R1 observes it, verification confirms, duplicate creates
  no second runtime, ownership-proven retire removes it, R1 observes absence, and no
  canonical/foreign runtime changes. Heavy; run explicitly (requires Docker + Supabase CLI).

## Boundary: what R3 is not

Not a policy engine (R2 owns policy). Not Director (no mission sequencing, approval,
orchestration retry, or replacement-intent creation). Not a second inspection engine (R1
owns observation). Not a second registry (R0 owns identity). No arbitrary shell, remote
fleet management, deployment orchestration, autoscaling, or cross-environment promotion.
No modification to R0–R2 contracts.
