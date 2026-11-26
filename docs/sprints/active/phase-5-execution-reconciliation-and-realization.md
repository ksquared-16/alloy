---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Operational Execution Reconciliation & Realization Plan

**Sprint:** `alloy-phase-5-product-realization` · **Baseline:** `origin/staging @ 1217f5c93` (+ this sprint's docs)
**Method:** reconcile the intended operator interaction against the running platform; find the smallest genuine
gaps; produce an implementation-ready plan and a first executable sprint. Read-only. No implementation. **Not** a new
doctrine — this adopts existing canonical concepts and names where each responsibility already lives.

**Decision-standard answer, up front:** **the current Alloy platform can already express and execute the complete
operator interaction — approximately 85% is built and wired.** The objective-machine-truth vs operator-declaration
distinction the mission asks for **already exists** (Action Result vs Outcome), objective facts **already** drive
configured consequences without an operator picker (`when_enter_status_key` / `when_domain_signal` rules), and
Cancel-Tour is a **working, config-driven** proof of the pattern. **No new Evidence / Truth / Business-Truth
subsystem is required.** The remaining work is *wiring and two de-hardcodings*, not architecture.

---

## Deliverable 1 — Existing Capability Map

For each step of the interaction: canonical owner · where it's implemented · status · usable from the primary
operator surface (Focus Panel / Current Work)? All `VERIFIED` against code unless noted.

| Interaction step | Canonical owner | Implementation | Status | Usable from primary surface? |
|---|---|---|---|---|
| Subject participates in Business Process | Business Process (`lifecycle_builder_v1`) | `businessProcessConfigReader`, seed process | ✅ built | yes |
| Subject occupies governed Stage | Stage (`stage_operating_plan_v1`) | `resolveEffectiveStageOperatingPlan` | ✅ built | yes |
| Operator gives Attention | Attention (Runtime K1) | `web/lib/runtime/kernel/attention.ts` | ✅ built, certified | yes |
| Runtime composes Current Work | Current Work (projection+composition) | `projectStageWorkRuntime` + `buildCurrentWorkSurfaceVM` | ✅ built | yes |
| Operator issues Command | Operational Command / Command Surface | `CommandSurfaceShell` (unified shell) | ◐ surface unified, **execution fragmented** | yes (shell); execution split |
| Registered capability executes | Capability + closed executor union | `canonicalActionRegistry` (`CanonicalActionExecutor`) + `executeAdminAction` + 4 more paths | ◐ **5 parallel executors**; registry has 3 keys | partial |
| Platform records objective result | Action Result / Operational Fact | `ActionResult`, `action_executed`, `communication_messages`+`delivery_events`, `tour_bookings` | ✅ recorded | (data exists) |
| Operator optionally reports what only a human knows | Outcome (declaration) | `completeStageWorkWithOutcome` → `executeStageOperatingOutcome` | ✅ built | yes |
| Configured consequences realized | Outcome Rules → closed-union targets | `stageOutcomeRuleTargetExecutor`; triggers `when_outcome_key`/`when_enter_status_key`/`when_domain_signal` | ✅ built + wired | (server) |
| Progression / membership recompose | Queue Membership (effective stage) | `resolveQueueMembership`, `queue_membership_v1` | ✅ derivation; ◐ refresh event-gated | partial |
| Current Work / Work Views recompose | Runtime recomposition (client events + warm cache) | `useRecordWorkRuntime`, `invalidateOpportunityStageWorkCache`, `warmCache` | ✗ **invalidates but does not re-apply**; no realtime | **no — needs reload** |

**Supporting capabilities (all present):** Communications production-hardened (send + delivery receipts +
identity); Appointments (`tourBookingService` schedule/reschedule/cancel/complete/no-show); Workflows
(`workflow_events`); Readiness (`buildReadinessVM`, Process Gates); Provenance (partial — `metadata.source` on sends,
separate event store for declarations). **Nothing in the interaction is architecturally absent.**

---

## Deliverable 2 — Interaction Trace

Where each interaction **succeeds · degrades · bypasses the canonical path · fails**, on the current platform.

### Contact Family — integrated path — ✅ succeeds (objective), ◐ degrades on recompose + a hardcode
`Command → canonicalOutboundEnqueue` inserts `communication_messages{status:queued}`, emits `message_queued`; backend
sends; `twilioSmsStatusWebhook` appends append-only `communication_delivery_events` (idempotent). The **objective
Action Result is recorded automatically** — Alloy knows queued/sent/delivered/failed. It also **auto-discharges** the
contact work via `associateOutboundCommunicationToContactAttempt`. **Degrades:** (a) the auto-outcome is hardcoded
`sent_text` — it *cannot* express "reached" vs "left message" because Alloy knows the send, not the human result;
(b) sending fires **no recompose event**, so Current Work does not update live.

### Contact Family — external path — ✅ succeeds, correct by construction, ◐ degrades on recompose
The operator declares an Outcome on the same `contact_family` work (`complete-stage-work`); it records a
`stage_work_outcome_recorded` fact and **fabricates no message** — Alloy does not pretend it sent anything. The same
Current Work contract is dischargeable both ways, converging on one consequence path. **Degrades:** no recompose
event; the panel relies on an optimistic card summary.

### Schedule Tour — ✅ succeeds (objective creation suffices)
`createTourBooking` inserts the `tour_bookings` row and knows creation succeeded; `confirmed_mirror` auto-moves the
opportunity to `tour_scheduled`. **The operator does not declare "Tour Scheduled"** — creation is sufficient. Good.
◐ The confirm→`tour_scheduled` *target status* is a hardcoded constant (`TOUR_BOOKING_OPPORTUNITY_STATUS`) rather
than a signal (see below). Recompose refreshes header actions only, not the stage-work slice.

### Reschedule Tour — ✅ succeeds
In-place UPDATE of the same booking (not a new row); reminders replaced, not duplicated; BP stays coherent. ◐ Same
stage-work recompose gap.

### Cancel Tour — ✅ succeeds, **config-driven (the model pattern)**
Cancel sets the *booking's* status and **emits a domain signal** `emitDomainLifecycleSignalEvent(tour_booking,
canceled)` → `applyConfiguredStageRulesForDomainSignal` → authored consequence (remain / reschedule work / follow-up
/ move / close / needs-attention). **The appointment capability does not embed the BP consequence.** This is exactly
the target. ◐ **But** `cancel_tour` is missing from the refresh key set, so Current Work recomposes *worst* here.

### Record Tour Result — ✅ succeeds (operator declares what Alloy can't know)
`markTourBookingCompleted/NoShow` are the operator's declaration; they drive status-entry consequences (progression /
follow-up / closure / new work). ◐ Target status semi-hardcoded via the same constant as schedule.

**Provider embedding:** ✗ none — Twilio/Resend live only in the comms layer; no integration provider appears in any
Business Process definition. Correct.

---

## Deliverable 3 — Gap Classification

Every finding, in the mission's taxonomy. **Nothing here is "missing architecture."**

| # | Finding | Classification |
|---|---|---|
| **G1** | The execution subject (`StageOutcomeExecutionSubject`, `buildExecutionSubject`) carries only `journey_segment`+`opportunity_id` — **no child id**; child-grain outcomes error and never complete; the `open_form`→`update_status` submit path also drops child/candidate grain | **Subject/grain defect** |
| **G2** | Current Work **invalidates** the stage-work cache on some events but **never re-applies** the slice to the live VM (the re-fetch effect is gated on the initial `"pending"` status); send / manual-comm / webhook / external-process fire **no** recompose; `cancel_tour` missing from refresh keys; no realtime/polling | **Invalidation/recomposition defect** |
| **G3** | Command execution is split across **5 parallel paths** (3-key registered runtime, legacy `executeAdminAction` switch, relationship executor, record-chrome PATCH that bypasses everything, outcome engine); one registered action delegates back into legacy | **Capability exists but is not composed** |
| **G4** | A successful **Command Result never advances Current Work** — `requires_outcome_picker` is derived only from "outcomes configured," ignoring results; `execution_mode: direct_action` exists but only changes CTA prominence, not closure; nothing calls `completeWorkInstance` from a result | **Runtime connection gap** |
| **G5** | Two hardcodes where cancel already shows the config-driven pattern: the `sent_text` auto-outcome on integrated contact, and the `TOUR_BOOKING_OPPORTUNITY_STATUS` confirm/complete/no-show constant | **Configuration gap** (de-hardcode to authored mapping/signal) |
| **G6** | No unified provenance attribute — integrated (`communication_messages.metadata.source`) and declared (`workflow_events`) facts live in separate stores; "the same result carrying different provenance on one fact shape" is not modeled | **Capability exists but is not composed** (one attribute, not a subsystem) |
| **G7** | Placement defects: capabilities advertised but unregistered (`update_enrollment_status`); placed commands that resolve to `unsupported` from Current Work; membership re-derivation gated on membership-class action keys, not raw stage change | **Surface gap** / **runtime connection gap** |
| **G8** | Childcare-named capability catalog + closed grain enums (`schedule_tour` vs `schedule_appointment(type)`) | **Vertical vocabulary debt** (do not solve now) |
| **G9** | Whether integrated contact should auto-declare a *business* outcome at all, vs always leaving the human result to the operator | **Genuine Product decision** (see OQ) |

**Not missing, explicitly:** the objective/declared distinction (exists), fact-triggered consequences (wired),
config-driven appointment consequence (proven by cancel), external-path support (works), provider isolation (clean).

---

## Deliverable 4 — Minimal Constitutional Refinements

Only where implementation **cannot proceed safely** without a doctrine correction. Two are required; one is a
clarification.

### R1 — The execution subject must carry the subject at the stage's declared grain *(required)*
- **Current language** (Execution Language, "Principle 5"): *"The subject is carried, never inferred."* The glossary
  treats Subject as first-class.
- **Observed conflict:** the *type* `StageOutcomeExecutionSubject = { journey_segment; opportunity_id }` structurally
  cannot carry a child — so child-grain work errors (`"Could not resolve child"`) and the doctrine is unrealizable as
  written.
- **Proposed language:** *"The execution subject carries an explicit subject identity at the grain the current Stage
  declares — not merely the root (case) id. Finer grain is carried, never re-derived downstream."*
- **Why blocking:** no child-grain interaction (M4, waitlist, per-child enrolling) is safe until the contract can
  name the child. Every child-grain slice depends on this.

### R2 — A known result may discharge Current Work when configuration declares it sufficient *(required)*
- **Current language:** *"Completion is the discharge of the contract by a declared Outcome — a declaration, not an
  action side effect."*
- **Observed conflict:** the mission requires that Alloy not "force every interaction through an Outcome picker if the
  platform already knows enough," while also not "allowing an Action Result to silently become a business declaration
  when human interpretation is required." The platform has the knob (`execution_mode: direct_action | outcome_led`)
  but it is not wired to closure.
- **Proposed language:** *"Where a Stage's work template is `direct_action` and configuration declares a known result
  sufficient, a successful Action Result discharges the work — no operator declaration required. Where the template
  is `outcome_led`, discharge always requires an operator-declared Outcome. An Action Result never becomes a business
  declaration."* (This refines, not contradicts: the declaration is still the only *judgment*; the refinement is that
  configuration may declare that no judgment is needed for this step.)
- **Why blocking:** without it, "Schedule Tour" and a successful "Send" must both pop an outcome picker, which is the
  precise anti-pattern the mission forbids — and the code already models the intent (`direct_action`) but doesn't
  honor it at closure.

### R3 — Operational Facts should carry execution provenance *(clarification)*
- **Current language:** provenance is defined for identity/config, not for execution facts.
- **Clarification:** *"An operational fact carries whether it was executed by the platform (integrated) or declared by
  the operator (external/manual). Provenance is an attribute of the fact, not a new fact kind."* — prevents G6 from
  being solved by inventing a parallel truth store.

**No new constitution document is required.** These are edits to the existing Execution Language, made only because
code cannot proceed safely without them.

---

## Deliverable 5 — Product Realization Plan

Smallest ordered vertical slices, each a demonstrable operator capability. **Order derived from repository evidence**
(not the mission's default): the first usable interaction — *Contact Family* — is **family-grain**, so it ships
*before* the grain fix and establishes the recompose + result-discharge pattern every later slice reuses.

Each slice: **operator capability · reused components · gaps closed · dependencies · acceptance · regression risk ·
non-goals.**

### Slice 1 — Contact Family, both paths, live recompose  → *(the first executable sprint, detailed below)*
- **Capability:** from a family's Current Work, contact via Alloy (integrated) **or** report an external contact;
  both discharge the contact work with the correct authored outcome and Current Work **recomposes live** (no reload).
- **Reuses:** `canonicalOutboundEnqueue` + delivery receipts, `completeStageWorkWithOutcome`, the three-kind trigger
  grammar, `CommandSurfaceShell`, `buildCurrentWorkSurfaceVM`, `useRecordWorkRuntime`.
- **Gaps closed:** G2 (re-apply, + send/manual dispatch a recompose event), G4 (a sufficient result discharges the
  work), G5-contact (authored contact-outcome mapping incl. reached vs left-message).
- **Dependencies:** none blocking (family grain — no G1).
- **Non-goals:** child grain, Tour, command convergence, webhooks/realtime, unified provenance.

### Slice 2 — Preserve the full Subject through execution (G1 + R1)
- **Capability:** child-grain Current Work completes from the primary surface without error; the affected child is
  named before any action.
- **Reuses:** the projection/executor/completion path from Slice 1, extended to carry the subject id.
- **Gaps closed:** G1; unblocks every child-grain interaction.
- **Dependencies:** R1 ratified. **Acceptance:** in a two-child household, a child-grain outcome completes and moves
  only that child. **Regression:** family-grain paths (Slice 1) must be unchanged.

### Slice 3 — Converge command execution onto the canonical path (G3, G7)
- **Capability:** every command the operator issues runs one execution path; the record-PATCH bypass and the
  advertised-but-unregistered capabilities are retired or registered.
- **Gaps closed:** G3, G7. **Dependencies:** Slices 1–2 (so the canonical path is grain-safe and recomposes).
- **Regression:** the legacy switch's inline mutations (person upsert, notes) must be preserved behaviorally.

### Slice 4 — Tour full lifecycle on the canonical path (G5-tour)
- **Capability:** Schedule / Reschedule / Cancel / Reminder / Record-Result all run as configured commands with
  config-driven consequences; replace `TOUR_BOOKING_OPPORTUNITY_STATUS` with a signal, matching cancel; recompose
  after each; add `cancel_tour` to the refresh set.
- **Gaps closed:** G5-tour, remaining G2 for tour events. **Dependencies:** Slices 1–3.

### Slice 5 — Recomposition completeness (G2 deep)
- **Capability:** Current Work recomposes from webhook facts (delivery receipts) and cross-process truth changes, not
  only same-tab events (server→client push / revalidation).
- **Gaps closed:** the realtime half of G2. **Dependencies:** Slice 1's recompose mechanism.

### Slice 6 — Unified execution provenance (G6, R3)
- **Capability:** one fact shape marks integrated vs external/manual; surfaces read provenance uniformly.
- **Dependencies:** Slices 1 & 4 (the fact producers).

### Slice 7 — Second-industry validation
- **Capability:** the same runtime drives a Legal or Healthcare configuration (Schedule consultation / Contact client
  / Record result) with only configuration + vocabulary changed — proving industry-agnosticism by execution.
- **Dependencies:** Slices 1–4.

---

## Deliverable 6 — First Executable Sprint

**Sprint: "Contact Family — one command, two paths, live recomposition."**

The smallest end-to-end interaction that makes the product materially more usable and establishes the reusable
spine (result-discharge + recompose) for every later slice.

- **Operator capability delivered:** from a family's Current Work in the Focus Panel, the operator either **sends via
  Alloy** (integrated — Alloy records the objective result) or **reports an external contact** (declaration); in both
  cases the `contact_family` work discharges with the correct **authored** outcome, and Current Work **recomposes live
  — no reload** — showing the attempt and the next step.
- **Existing components reused:** `canonicalOutboundEnqueue` + `communication_delivery_events` (integrated result);
  `completeStageWorkWithOutcome` (declaration); the three-kind outcome-rule grammar (consequence); `CommandSurfaceShell`
  (invocation); `buildCurrentWorkSurfaceVM` / `useRecordWorkRuntime` (surface + recompose).
- **Exact gaps closed:**
  1. `onQueueUpdated` **re-applies** the stage-work slice after `invalidateOpportunityStageWorkCache` (fixes
     invalidate-without-reapply).
  2. Communications send **and** manual-report paths **dispatch** an `opportunity-updated` recompose event.
  3. Replace the hardcoded `sent_text` auto-outcome with an **authored contact-outcome mapping** (integrated success →
     configured outcome; the operator may still amend to "reached" vs "left message").
  4. A successful send's **Action Result discharges** the `direct_action` contact work per configuration (R2), while
     the external path stays operator-declared.
- **Dependencies:** R2 ratified (result-may-discharge). No G1 (family grain).
- **Acceptance criteria:**
  - Integrated: send → `communication_messages` + `communication_delivery_events` rows → contact work discharged →
    Current Work recomposes live showing the attempt; **no reload.**
  - External: report → `stage_work_outcome_recorded` (no fabricated message) → work discharged → recompose live.
  - Both paths reach the **same** configured consequence; **no duplicate outcomes**; the integration is not forced;
    Alloy never claims a send it didn't make.
  - A second industry's "Contact Client" configuration exercises the identical path (vocabulary only).
  - Unit tests + a **runtime-invalidation test** proving recompose fires on both paths.
- **Regression risks:** the optimistic card summary must be replaced by (not stacked on) real recompose; guard against
  dispatch loops; the auto-discharge must **not** fire for `outcome_led` templates where a human result is required.
- **Explicit non-goals:** child grain (Slice 2), Tour (Slice 4), command-execution convergence (Slice 3),
  webhook/realtime recompose (Slice 5), unified provenance attribute (Slice 6).

*Do not implement during this reconciliation. This defines the first sprint; it awaits approval.*

---

## Decision-standard check

- **Model already represented by Alloy wherever possible:** yes — ~85%; the objective/declared distinction, fact-
  triggered consequences, and config-driven appointment consequences are all present and wired.
- **Real gaps precisely identified:** nine, classified, each pointed at file:line evidence in the source traces.
- **No duplicate concepts introduced:** none — the plan composes existing capabilities; the only new *data* is one
  provenance attribute (R3), explicitly not a subsystem.
- **Next sprint makes the product materially more usable:** Contact Family becomes an end-to-end, live-recomposing,
  configuration-driven interaction on the primary surface.
- **Tour becomes a configuration-driven example of the same system:** Slice 4, building on the same spine, with cancel
  already proving the pattern.

---

**Reconciliation complete. Realization plan and first sprint defined. No implementation begun. Awaiting review.**
