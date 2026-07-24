---
owner: engineering
status: handoff
last_reviewed: 2026-07-23
supersedes: []
---

# Phase 5 — Platform Transaction Contract: certification and handoff

**Mission:** make execution trustworthy. The operator must never wonder "did that actually
work?". Every configured action either commits the whole pipeline, or changes nothing and says
why.

This document reports what was reproduced, observed, traced, fixed and verified. Where a claim
is not certified, it says so and says what would close it.

Companion document: [`phase-5-transaction-integrity-handoff.md`](phase-5-transaction-integrity-handoff.md)
— the prior session's audit, which named the defects this session fixed.

---

## 1. Phase 1 — the Platform Transaction Contract

`web/lib/platform/transaction/platformTransaction.ts`

Configured capabilities had each been implementing transaction behaviour for themselves. That
is the root cause of the trust problem: each capability decided independently what "success"
meant, whether to compensate, and what to report. There is now one pipeline they all run
through:

```
validate → persist → business_process → activity → relationships
  → cache_invalidation → recomposition → COMMIT

  or: any in-boundary failure → compensate in reverse → nothing changed → explanation
```

Steps declare **what** they do and **how to undo it**. Ordering, abort, compensation, honest
reporting, duplicate suppression and tracing live in the contract, once.

Three guarantees it exists to enforce:

1. **A step is reported with the status it earned.** Not the status it was expected to earn.
2. **"Nothing changed" is proven, not assumed.** If a compensation fails, the result is
   `partially_committed` with an `integrity_breach` — never a clean-looking abort.
3. **Downstream effects are declared, not assumed.** A step is either `inside` the boundary
   (failure rolls back) or explicitly `outside` it (failure degrades the result and is
   reported). There is no third, implicit "swallowed" category.

Postgres transactions are not reachable through PostgREST, so the boundary is a saga: forward
steps with compensating inverses, applied in reverse on abort.

Also carries the Phase 4 instrumentation seam — every transaction emits one trace with a
correlation id, per-step stage/boundary/status, and per-step timing — and in-flight duplicate
suppression, so a double-submit joins the running transaction rather than executing twice.

**Tests:** 17 (`tests/platform/platformTransaction.test.ts`).

---

## 2. Phase 2 — capability audit

### 2a. Record Outcome — the highest-severity defect, fixed

**Reproduced.** Recording an outcome closed the work item first
(`completeStageWorkWithOutcome.ts:88`) and applied the configured Business Process rule targets
afterwards (`:111`) with collect-and-continue semantics and no rollback. A target failure
returned an error to the operator while the work was already closed and the stage had already
moved. Additionally `executeStageOperatingOutcome.ts:49` pushed every target into
`applied_targets` **before** running it, so failed targets were reported as applied;
`applyConfiguredStageAutomationRules.ts:69` had the same bug for `applied_rule_keys`.

**Fixed.** `completeStageWorkWithOutcome` now runs on the contract:

| Stage | Step | Inverse |
|---|---|---|
| persist | `work_state` (close, or record attempt + configured retry reopen) | exact restore of the `operational_tasks` row snapshot (status, due_at, metadata) |
| business_process | `apply_outcome_rules` | `rollbackStageOperatingOutcome` — every target's own inverse, in reverse order |
| activity | `execution_provenance` | restore prior task metadata |
| activity | `contact_outcome_trace` | — (append) |

Every rule target now captures its inverse **at the point of the write**: family case status,
child enrollment state, candidate status, needs-attention metadata, spawned work, reopened
work, and the stage move for both family and child journeys.

Two silently-swallowed effects are now declared and reported rather than hidden: the empty
catch around destination stage-entry work (a stage could move with no destination work and
nobody knew), and the child-lifecycle-event / enrollment-materialization catches. Two
discarded return values are now checked: the contact-outcome trace and the execution-provenance
stamp.

The route propagates a correlation id end to end, returns the transaction envelope with an
explicit `changed`, suppresses a double-submit, and returns **500 rather than 400** when a
rollback failed — because durable state is uncertain and "retry" is the wrong advice.

**Tests:** 10 (`tests/lifecycle/recordOutcomeTransactionIntegrity.test.ts`).

### 2b. Tour lifecycle — five transitions still had the ghost shape

`createTourBooking` was made atomic last session. `confirm` / `reschedule` / `cancel` /
`complete` / `no_show` were not: each committed the booking update and then ran the opportunity
integration and the lifecycle event unguarded.

All six now run through one shared transition helper on the contract. The booking row is
snapshotted and restored exactly; `applyTourBookingOpportunityIntegration` returns the inverse
of its metadata mirror and undoes it itself when the domain signal fails; comms are **declared**
outside the boundary rather than being outside it by convention.

One ordering bug fixed on the way: `cancel` ran the cancel signal **after** the best-effort
comms, so a notification could fire for a cancellation the Business Process never learned about.

`createTourBooking`'s bespoke try/catch and `compensateFailedTourBookingInsert` are deleted —
the contract does that work now, which is the point of Phase 1.

**Tests:** 7 (`tests/tours/tourLifecycleTransactionIntegrity.test.ts`).

### 2c. Capabilities NOT audited this session

**Message** and **Send Form** were fixed last session (`e320cbb91`) but have **not** been moved
onto the contract and have **not** been live-executed. **Add Child**, **Add Family Member**,
**Requirement Handoffs** and standalone **Lifecycle Transitions** were not audited at all. They
are listed in the matrix as such rather than assumed good.

The out-of-brief cluster named in the prior handoff is also still open:
`communicationScheduledSendsService.ts:648-700` (claimed row + enqueued message),
`family-send/route.ts:112-113` (post-send throw after per-recipient commits),
`canonicalOutboundEnqueue.ts:240,268` (swallowed workflow-event and dispatch failures),
`associateOutboundCommunicationToContactAttempt.ts:142` (unchecked link-back update).

---

## 3. Phase 3 — Business Process integrity: should a confirmed tour advance the process?

**Not answered — it is a product decision, and it stays open.** What this session produced is
the evidence, by executing the real configuration through the real rule matcher rather than
reading code. `tests/lifecycle/tourAdvancementConfigurationEvidence.test.ts` (8 tests).

Traced: **Business Process → Configured Trigger → Configured Rule → Configured Transition.**
The trace stops at *Configured Rule*.

- The only `tour_booking` domain rule in the shipped configuration is
  `domain_tour_booking_canceled_attention` (signal `canceled`). No stage of any default plan
  has a `scheduled` rule.
- Executing `applyConfiguredStageRulesForDomainSignal` with `{tour_booking, scheduled}` loads
  the configuration, matches **zero** rules, and **writes nothing**. The trigger fires; nothing
  is configured to receive it.
- The same call with `canceled` **does** apply and writes. **The machinery works. The gap is
  configuration, not code.** `70bec543e` replaced the retired status mechanism with a domain
  signal and the replacement rule was never authored.

Two findings that change what any fix would have to do:

- **A published tenant plan shadows the code default outright.** `resolveEffectiveStageOperating
  Plan` returns `explicit` and never merges. A rule added only to code would not reach a tenant
  that already has a published plan. **Confirmed live:** the running tenant's `lead` stage
  offers `reached_qualified / left_message / awaiting_response / unable_to_reach /
  contact_closed_lost`, while the code default offers `reached_family / left_message /
  needs_follow_up / interested / not_interested`. The two sources have already diverged in
  production data.
- **One seed migration destroys another's rule.** `20260622205001` wholesale-replaces the
  `tour_scheduled` plan that `20260622150000` had patched, and the replacement never mentions
  the canceled rule. For a tenant that ran both, even the `canceled` signal is now inert.

No behaviour was changed. Authoring the rule remains blocked on the product decision, and on a
decision about how published tenant plans get corrected (there is still no re-publish path).

---

## 4. Phase 4 — runtime certification

Instrumentation is not a side channel: it is the contract's own output. Every transaction emits
`{capability, correlation_id, outcome, changed, duration_ms, steps[{name, stage, boundary,
status, duration_ms, error}], actor_user_id, subject, integrity_breach}`.

**Live certification against the running app** (slot 1, `:3011`, authenticated QA identity,
real tenant record — no fixtures, no seeded data):
`web/playwright/tests/platform-transaction-cert.spec.ts`, 2 tests, both passing.

Evidence written to `docs/sprints/active/assets/platform-transaction-cert/`.

| Case | Observed |
|---|---|
| **Abort at validation** — real work item, unconfigured outcome key | HTTP 400; `x-correlation-id` echoes the id the click carried; `changed: false`; `transaction.outcome: "aborted"`; single `validate:failed` step; no `integrity_breach`. Nothing written — the record is left exactly as found. |
| **Failure past validation** — configured outcome, nonexistent work item | HTTP 400; `changed: false`; `validate:ok` → `work_state:failed` → `apply_outcome_rules:skipped`. The pipeline entered persistence, stopped there, and the Business Process never ran. |

Both cases are deliberately non-destructive, which is why they can run on demand against real
data. The subject is harvested from the drawer's own `stage-work` view model, so the
certification runs against whatever the tenant actually has configured.

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json npx playwright test playwright/tests/platform-transaction-cert.spec.ts --workers=1
```

---

## 5. Phase 5 — certification matrix

Rule: **nothing is certified until every column is YES.** By that rule, **nothing is certified
yet.** The matrix below is the honest state, not a target.

| Capability | Atomic | Rollback safe | Activity | Business Process | Recompose | Certified |
|---|---|---|---|---|---|---|
| **Record Outcome** | YES | YES | YES | YES | **not verified** | **NO** |
| **Schedule Tour (create)** | YES | YES | YES | **NO** — signal matches no rule (§3) | YES ¹ | **NO** |
| **Confirm tour** | YES | YES | YES | unverified ² | not verified | **NO** |
| **Reschedule tour** | YES | YES | YES | unverified ² | not verified | **NO** |
| **Cancel tour** | YES | YES | YES | partial ³ | not verified | **NO** |
| **Complete tour** | YES | YES | YES | unverified ² | not verified | **NO** |
| **No-show tour** | YES | YES | YES | unverified ² | not verified | **NO** |
| **Message** | partial ⁴ | partial ⁴ | YES | YES ⁵ | YES ¹ | **NO** |
| **Send Form** | partial ⁴ | partial ⁴ | via comms only | **NO** — no BP association | not verified | **NO** |
| **Add Child** | not audited | not audited | not audited | not audited | not audited | **NO** |
| **Add Family Member** | not audited | not audited | not audited | not audited | not audited | **NO** |
| **Requirement Handoffs** | not audited | not audited | not audited | not audited | not audited | **NO** |
| **Lifecycle Transitions** | not audited | not audited | not audited | not audited | not audited | **NO** |

¹ Verified live in the **prior** session, not re-verified here.
² The signal is emitted and the pipeline is atomic; which configured rules receive it was not
traced for these transitions.
³ The `canceled` rule exists in code defaults but is clobbered for tenants that ran both seed
migrations (§3).
⁴ Boundary and honest reporting added in `e320cbb91`; **not** moved onto the contract, and
never live-executed.
⁵ Discharges Current Work through `completeStageWorkWithOutcome`, which is now atomic.

**The shortest path to a first fully-certified capability is Record Outcome**: every column but
Recompose is evidenced. Closing it needs a live proof that a successful outcome recomposes the
Focus Panel without a reload — the wiring exists (`adminv2:opportunity-updated` →
`useRecordWorkRuntime`) and the route returns `queue_refresh_opportunity_id`, but no test in
this session asserts the end-to-end recomposition. That run mutates real data, which is why it
was not folded into the non-destructive certification spec.

---

## 6. Verification state

| Gate | Result |
|---|---|
| **Project typecheck** (`npm run typecheck`, `tsconfig.build.json`) | **clean** — this also clears the prior handoff's outstanding caveat that `e320cbb91` was never typechecked |
| `tests/platform/platformTransaction.test.ts` | 17 passing |
| `tests/lifecycle/recordOutcomeTransactionIntegrity.test.ts` | 10 passing |
| `tests/lifecycle/tourAdvancementConfigurationEvidence.test.ts` | 8 passing |
| `tests/tours/tourLifecycleTransactionIntegrity.test.ts` | 7 passing |
| `tests/lifecycle/` | 88 failing before and after — **identical set**, all pre-existing builder/UI suites; 969 → 998 passing |
| `tests/tours/` | 5 failing before and after — identical set, pre-existing UX suite; 127 → 135 passing |
| Live certification | 2 passing against the running app |

Two pre-existing failures were also fixed: `completeStageWorkWithOutcome.test.ts` asserted
outcomes (`qualified`, `closed_lost`) that the lead stage plan does not configure.

**Environment note worth keeping.** The slot-1 dev server returned HTTP 500 on every page with
`Cannot find module '../lightningcss.darwin-x64.node'`. Root cause: the server was running the
**x86_64 slice** of the universal `/usr/local/bin/node`, so `@tailwindcss/node` resolved a
`darwin-x64` lightningcss binary that is not installed (only `darwin-arm64` is). Restarting with
the arm64 node first on `PATH` fixes it:

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && alloy-worker-resume 1
```

---

## 7. Branch

| | |
|---|---|
| **Worktree** | `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1) |
| **Branch** | `agent/claude/1-alloy-phase-5-product-realization` |
| **This session** | 4 commits: the contract, Record Outcome atomicity, Business Process evidence, tour lifecycle atomicity |
| **Push / merge** | neither — not pushed, not merged |

---

## 8. What remains

1. **Close Record Outcome** — the live recomposition proof (§5).
2. **Move Message and Send Form onto the contract** and live-execute them.
3. **Audit the four untouched capabilities** — Add Child, Add Family Member, Requirement
   Handoffs, Lifecycle Transitions.
4. **The out-of-brief swallowed-error cluster** (§2c) — same shape, different files.
5. **The two open product decisions** — whether a confirmed tour advances the process, and how
   published tenant plans get corrected. Both are documented with evidence in §3; neither is
   an engineering blocker, and neither should be guessed.
