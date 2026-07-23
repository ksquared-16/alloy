---
owner: engineering
status: handoff
last_reviewed: 2026-07-23
supersedes: []
---

# Phase 5 — Engineering Handoff: What's Next Transaction Integrity

**The UI and interaction model are mature and accepted. The remaining concern is transaction
integrity, not presentation.** The Product Owner does not yet trust the platform's execution
results. That is the priority for the next session.

This document is the complete state at session close. Read it before touching code.

---

## 1. Architecture completed

| Area | State | Anchors |
|---|---|---|
| **What's Next summary** | Obligation-first card; one dominant action + helpful actions + Record outcome; "Still needed" grouped by owning capability; card-level drill-in footer | `CurrentWorkCard.tsx` |
| **Centered configured-work surface** | `current_work` elevates as a centered Focus Card through UniversalCard; compact hosted-capability mode when a capability is active | `CurrentWorkFocusedSurface.tsx`, `focusPanelCoordinationModel.ts` |
| **Generic capability runtime** | Host resolved from capability metadata (`interactionHost`), never a label/stage/process/target string; unresolvable capability → `unsupported` (never a working-looking button) | `resolveCurrentWorkActionSurface.ts`, `canonicalActionRegistry.ts` |
| **Communications hosting** | Real comms runtime inline via the Activity embed contract; pinned footer (Send later · BOS Assist · Send) in every mode | `CurrentWorkActionPanel.tsx`, `FamilyCommunicationWorkspaceView.tsx` |
| **Scheduling hosting** | `inline_form` host; Alloy visual language; host-shell-first (opens straight to the picker, no blocking bootstrap gate) | `OpportunityTourScheduleActionModal.tsx`, `OpportunityTourSlotSchedulePanel.tsx` |
| **Form delivery** | Generic `form_delivery` host over configured forms / eligible recipients / related subjects / executable channels | `FormDeliverySurface.tsx`, `form-deliver/route.ts` |
| **Outcomes** | Dedicated decision mode; compact rows; effect text normalized + de-duplicated through one shared contract | `buildCurrentWorkResolutions.ts`, `stageWorkOutcomeEffectLines.ts` |
| **Transitions** | Generic `resolveOutgoingProcessTransitions` with referential-integrity filtering of dangling targets | `resolveOutgoingProcessTransitions` |
| **Requirement ownership** | Requirements grouped by owning capability; the owner heading itself is the single handoff | `CurrentWorkReadinessSummary.tsx`, `resolveCurrentWorkRequirementOwner.ts` |
| **Recomposition** | Capability success dispatches `adminv2:opportunity-updated` → inline VM reload; no page reload anywhere | `useRecordWorkRuntime.ts` |
| **Capability registry** | Capabilities declare category + `interactionHost` + `runtimeWired`; the host knows only the descriptor | `actionDefinitionRegistry.ts:135-164` |
| **Warm-open contract** | One dispatcher keyed on the capability HOST warms each capability on card render + hover/focus; hosts render warm data synchronously and re-verify in background | `warmCurrentWorkCapabilities.ts`, `tourScheduleWarmCache.ts`, `formDeliveryWarmCache.ts`, `drawerFamilyWorkspacePrefetchCache.ts` |

**Certified by tests:** a newly configured Business Process can expose these actions with **no
What's Next presentation code** — all 7 configuration-provenance proofs + cross-process parity
(`currentWorkActionProvenance.test.ts`, `currentWorkCommandIntegrity.test.ts`, `currentWorkResolutions.test.ts`).

---

## 2. Commits this session (12, oldest → newest)

All on `agent/claude/1-alloy-phase-5-product-realization`. None pushed.

| Commit | Purpose | Files | Tests | QA | Known limitations |
|---|---|---|---|---|---|
| `83e0c2494` | Final UX convergence — 6 shared-contract fixes (owner handoff, Still-needed hierarchy, tour visual language, compact outcomes + effect dedup, composer footer pinning, canonical Blocked chip) | CurrentWorkCard, alloyOsRuntime.css, tour modal/panel, buildCurrentWorkResolutions, stageWorkOutcomeEffectLines, FamilyCommunicationWorkspaceView | delta vs stashed baseline = zero net-new | typecheck 0 errors | none |
| `cb6921312` | Phase A — instrument + diagnose duplicate init; in-flight de-dup of the K2 entry fetch | `currentWorkInitDiagnostics.ts` (new), SurfaceHostContext, InlineOpportunityFocusPanel, useRecordWorkRuntime, workUnitProvisioningPrefetch, workUnitEntryResourceClient | — | authenticated Playwright timeline | Diagnostics are dev+flag-gated (`?wnDebug=1`) |
| `44ac54498` | Review round 1 — equal buttons, owner-heading nav, composer footer wiring, tour warm cache | ReadinessSummary, alloyOsRuntime.css, FamilyCommunicationWorkspace(+View), tour modal/panel, CurrentWorkCard, `tourScheduleWarmCache.ts` (new), `warmCurrentWorkCapabilities.ts` (new) | readiness handoff test updated | — | Equal-buttons fix incomplete (see next) |
| `1b22308da` | Verified + finished review fixes — buttons on one line; tour host-shell-first | alloyOsRuntime.css, tour modal, tourScheduleWarmCache | — | measured: widths `[149,151,151,210]` → `[110,112,112,112]`; tour click→availability `>8s + loader` → **82ms, no loader** | — |
| `942a6eeed` | Summary and "View details" show the SAME buttons (one shared derivation) | `resolveCurrentWorkActionButtons.ts` (new), CurrentWorkCard, CurrentWorkFocusedSurface | zero net-new | `focusedMatchesSummary: true` | — |
| `eed423aeb` | Composer footer wraps so the 3 controls never clip | alloyOsRuntime.css | — | — | — |
| `29e81cf43` | Generic warm-open — every What's Next command opens instantly | warmCurrentWorkCapabilities, CurrentWorkCard, CurrentWorkFocusedSurface | zero net-new | Message **90ms** no "Loading conversation"; Tour **208ms** no loader | — |
| `e5de7534b` | Send form warm adapter | `formDeliveryWarmCache.ts` (new), warmCurrentWorkCapabilities, FormDeliverySurface | — | not live-executed | — |
| `70bec543e` | **Tour booking stops writing retired opportunity status** (status_definitions error) | `tourBookingOpportunityIntegration.ts`, its test (rewritten), `tour-booking-cert.spec.ts` (new) | rewritten w/ regression guard: never writes `status_key` | **live booking** "Confirmed Jul 27 2026 9:00 AM"; no status error; reopen shows reservation | **Introduced a regression** — see §5 |
| `2e5c3a957` | Configuration-provenance certification | `currentWorkActionProvenance.test.ts` (new) | 6 new; 35 total with existing | — | — |
| `f0c99413e` | **Book Tour made atomic** — compensating delete; no ghost booking | `tourBookingService.ts`, its test | `ATOMICITY: a post-insert failure compensates` | — | Compensation is app-level, not a DB transaction |
| `e320cbb91` | **Comms send + form delivery report canonical truth** | `communications/send/route.ts`, `form-deliver/route.ts`, `FormDeliverySurface.tsx` | targeted suites pass (14) | not live-executed | ⚠️ **Full typecheck NOT completed** — OOM-killed at session close. Re-run `npx tsc --noEmit` before promotion |

---

## 3. Current defects

### 3a. TRANSACTION INTEGRITY (the priority)

The ghost-transaction class is **systemic**. Audit verdicts:

| Path | False SUCCESS | False FAILURE | Compensation | Status |
|---|---|---|---|---|
| Schedule Tour | — | was YES (committed row + HTTP 400) | **added** (`f0c99413e`) | **FIXED** |
| Communication send | was YES (`assoc.error` dropped) | was YES (500 after the email actually sent → operator re-sends, double-messaging the family) | boundary added (`e320cbb91`) | **FIXED, not live-verified** |
| Form delivery | was YES (partial reported as full; link-only as sent) | was YES (502 with a live unexpiring link committed) | link deactivation added (`e320cbb91`) | **FIXED, not live-verified** |
| **Outcome execution** | **YES** — `applyConfiguredStageAutomationRules.ts:69` records failed targets as applied; empty `catch` at `stageOutcomeRuleTargetExecutor.ts:317` hides a missing destination work item | **YES** — `completeStageWorkWithOutcome.ts:89` closes the work, `:111` then applies targets; a target failure returns 400 while the work is **closed** and the stage **already moved** | **NONE** | ❌ **OPEN — highest severity** |

**Out-of-brief, same shape, unfixed:**
- `communicationScheduledSendsService.ts:648-700` — a scheduled row can stay `claimed` with a message already enqueued (duplicate-send exposure, guarded only by `.is("communication_message_id", null)`).
- `family-send/route.ts:112-113` — post-send throws become 500 after per-recipient sends committed.
- `canonicalOutboundEnqueue.ts:240,268` — `workflow_events` emit and workflow dispatch failures are swallowed (`console.warn` only).
- `associateOutboundCommunicationToContactAttempt.ts:142` — the metadata link-back update's error is never checked; work can close with no link to the message.

### 3b. RUNTIME

- **Duplicate initialization — RESOLVED as dev-only.** Measured: identical fiber id across mount→unmount→mount ⇒ React Strict Mode dev double-invoke. Production renders once. Init is warm-served (0 network); the re-invoked effect does not refetch (`recordRuntime.fetch.skip`). Evidence: `phase-5-runtime-phaseA-findings.md`.
- **Cold capability startup — RESOLVED** for all three capabilities via the warm-open contract (Message 90ms, Tour ~82–208ms, Form warm). Cold path still shows a local shell, never a blocking gate.
- **Cache** — warm caches are TTL + in-flight de-duped; tour warm invalidates on booking. **Not yet proven:** cross-record leakage on rapid record switching (Digan switch never exercised).
- **Recomposition** — works via `adminv2:opportunity-updated`; no reload required anywhere.

### 3c. CONFIGURATION

- **Business Process — the tour advancement rule does not exist.** No configured rule anywhere matches `{domain: "tour_booking", signal: "scheduled"}`. The only tour_booking rule is `domain_tour_booking_canceled_attention` (signal `canceled`, `defaultEnrollmentStageOperatingPlans.ts:677-680`).
- **Status/State** — `opportunities.status_key ∈ {open, closed}` after the collapse migration; the tour position lives on `stage_key`. `tour_bookings.status_key` is the scheduling SoT under its own CHECK constraint. `tour_booking` is intentionally **not** registered in `status_definitions`.
- **Published plan / tenant configuration — STALE AND SHADOWING.** Plans live in `departments.metadata...stage_operating_plan_v1`. An explicit tenant plan **shadows** code defaults and **there is no re-publish/reset path** (`persistStageOperatingPlanV1` = "preserve"). Any new rule must land in **both** the code default and tenant metadata.
- **Seed data — a real clobber bug.** `20260622205001_firefly_granular_tour_bp_stages.sql:127` wholesale `jsonb_set`-overwrites the `tour_scheduled` plan, **destroying** the canceled rule added by `20260622150000`. For that tenant even the `canceled` signal is now inert.

### 3d. PRESENTATION (polish only — no action required)

- The BOS assistant panel overlaps the right edge of the centered card in QA screenshots (separate always-open panel, not the card).
- Legacy (non-comms-v2) composer footer pinning is unverified; v2 pins it.
- Slice G — legacy `CurrentWorkWorkspace.tsx` retirement **NOT STARTED** (no longer mounted in the focused path).

---

## 4. Audit findings per capability

### Message
- **Execution path:** action (capability metadata, category `communication`) → `communications_composer` host → `CommunicationsDrawerSection` (comms-v2 → `FamilyCommunicationWorkspace`) → `executeCommunicationsSend` → `canonicalOutboundEnqueue`.
- **Canonical writes:** `communication_threads` (upsert), `communication_messages` (`queued`), `workflow_events` (`message_queued`), backend delivery queue trigger.
- **Activity:** via `workflow_events`; contact-attempt association may also close stage work.
- **Business Process:** `associateOutboundCommunicationToContactAttempt` → `completeStageWorkWithOutcome`; the only configured sufficiency entry is `communications_send`/`sent` → satisfies `left_message` → `no_movement`.
- **Integrity issues:** false failure after a real send; `assoc.error` dropped; multi-recipient loop aborts on first failure leaving earlier recipients sent; swallowed workflow-event errors.
- **Fixes:** `e320cbb91` (boundary + honest reporting).
- **Remaining:** live provider-safe send never executed; multi-recipient partial-send reporting still aborts client-side.

### Schedule Tour
- **Execution path:** `schedule_tour` (`interactionHost: inline_form`) → slot panel → `POST /api/admin/tours/bookings` → `createTourBooking`.
- **Canonical writes:** `tour_bookings` (status `confirmed`), `opportunities.metadata` (tour_date/tour_time mirror), `workflow_events` (`tour_confirmed`).
- **Activity:** `emitTourBookingLifecycleEvent("tour_confirmed")` — **was unreachable** before `70bec543e` because the mirror threw first.
- **Business Process:** emits `{tour_booking, scheduled}` domain signal → `applyConfiguredStageRulesForDomainSignal` → **matches zero rules** → no movement.
- **Integrity issues:** status-definitions error (fixed); ghost booking (fixed).
- **Fixes:** `70bec543e`, `f0c99413e`.
- **Remaining:** the advancement rule is unauthored (§5); reschedule/cancel paths not audited for the same atomicity.

### Send Form
- **Execution path:** `send_form` (`interactionHost: form_delivery`) → `FormDeliverySurface` → `POST .../form-deliver`.
- **Canonical writes:** `form_public_links` (live, unexpiring), then per-recipient `executeCommunicationsSend` writes.
- **Activity:** via the comms path only.
- **Business Process:** **none** — this route never calls `associateOutboundCommunicationToContactAttempt`, so a successful form send never discharges Current Work.
- **Integrity issues:** partial reported as full; link-only reported as sent; orphan live link on total failure.
- **Fixes:** `e320cbb91`.
- **Remaining:** never live-executed; no BP association by design gap.

### Record Outcome
- **Execution path:** outcome mode (in-VM, no network to open) → `completeStageWorkWithOutcome` → `executeStageOperatingOutcome` → `stageOutcomeRuleTargetExecutor`.
- **Canonical writes:** work instance completion, then rule targets — `opportunities.status_key` / `stage_key`, `process_instances`, `placement_candidates`, next-work instantiation, `opportunities.metadata` (needs-attention).
- **Activity:** provenance stamp + contact-outcome trace (both skipped when the error return fires).
- **Business Process:** configured `outcome_rules`; lead advances only via `reached_family` / `interested` (`successful: true` → `move_to_stage lead_to_tour`).
- **Integrity issues:** **work closed before targets applied; no rollback; errors collected-and-continued; failed targets counted as applied; empty catch hides missing destination work.**
- **Fixes:** **NONE.**
- **Remaining:** the whole path — this is the highest-severity open defect.

---

## 5. Open architectural decisions (documented, NOT answered)

1. **Should a confirmed tour booking automatically advance the Business Process?**
   Context: before `70bec543e` the booking wrote `opportunities.status_key = "tour_scheduled"`, which drove a stage move via `detectBuilderStageTransition`/`resolveBuilderStageForStatus`. That status was retired by the collapse migration. The fix replaced the mechanism with a domain signal — **the replacement rule was never authored**, so the lead no longer moves. If the answer is yes, the rule must use `stage_key` (not a bare `transition_ref`; the domain-signal path bypasses `resolveStageTransitionExecutionTargets`) and must land in **both** the code default and tenant metadata. Sub-decision: should it also close "Contact Family"? `mark_stage_work_complete` is a **no-op** in the target executor, so a stage move would otherwise leave a dangling task. Per current configuration, tour booking is a *helpful action* with no completion semantics.

2. **Should outcome execution become a single atomic Business Process transaction?**
   Today the work item is closed first and rule targets are applied afterwards with collect-and-continue semantics and no rollback. Options previously identified: **(A) reorder** — apply targets first, close the work last (changes attempt/retry semantics the configured `reopen_work` policy depends on); **(B) compensate** — reopen the work item if targets fail (leaves partial target writes). Neither is safe to choose without a product/architecture ruling.

3. **What is the transaction boundary for downstream effects generally?** Tour comms are explicitly best-effort and outside the transaction; comms `workflow_events` failures are swallowed; form delivery has no BP association at all. There is no stated platform rule for which downstream effects are inside vs outside an operator transaction.

4. **How do published tenant plans get corrected?** There is no re-publish/reset path, and one migration already clobbers another's rules. Config fixes currently require hand-written migrations per tenant.

---

## 6. Branch

| | |
|---|---|
| **Worktree** | `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1) |
| **Branch** | `agent/claude/1-alloy-phase-5-product-realization` |
| **Commits ahead / behind** | **50 ahead / 71 behind** `origin/staging` (rebase required at promotion) |
| **Tree** | clean (`web/next-env.d.ts` regenerates during dev — `git restore` it) |
| **Server** | slot 1 dev server on `http://localhost:3011`; volatile this session (repeatedly paused/stopped; toolkit caps at 3 concurrent servers) |
| **Push state** | **not pushed** |
| **Merge state** | **not merged** |

**Verification caveat:** the full `npx tsc --noEmit` could not complete at session close (OOM-killed under machine memory pressure; 10 stray `tsc` processes had accumulated and were killed). Every earlier commit typechecked clean. **Re-run the full typecheck before any promotion**, particularly for `e320cbb91`.

**QA state:** Wenc Family now has a real active tour booking (**Confirmed Jul 27 2026 9:00 AM**) created during certification. Tour re-tests will show the duplicate guard until it is canceled.

**Reusable harnesses:** `whats-next-init-timeline.spec.ts` (runtime timeline + request census), `whats-next-review-verify.spec.ts` (UX + warm-open proof), `tour-booking-cert.spec.ts` (booking certification). Run directly — the toolkit's `focused-spec` does not inject env:
```
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
  PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
  npx playwright test playwright/tests/<spec> --workers=1
```

---

The remaining work is platform transaction integrity and runtime certification, not feature implementation.
