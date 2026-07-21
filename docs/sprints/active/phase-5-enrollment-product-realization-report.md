---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Enrollment Product Realization Report

**Sprint:** `alloy-phase-5-product-realization` · **Slot:** 1 · **Baseline:** `origin/staging @ 1217f5c93`
**Method:** operator-POV walkthrough of the full enrollment journey, traced through the code and the reference
tenant config (`supabase/seed/local_representative_seed.sql`) that actually drives it. Read-only. No implementation.

**The question:** can a childcare operator take a lead, family, and child from first inquiry to operational
enrollment — attendance-ready and billable — **using only the product**, no engineer? Every "no" is remaining
engineering.

**Evidence:** `VERIFIED` = read in code/config on this baseline. `INFERRED` = reasoned, not executed. A live
click-through was deliberately not run: the operational tail is feature-flagged **off by default** and the
reference tenant carries config defects (below), so a drive would dead-end for reasons already provable from the
source — and the shared hosted DB is not a safe mutation target. The walkthrough is code-and-config grounded.

---

## 0. One correction to the record, up front

Prior Phase-5 documents (and the Product Office's M3 finding) describe the reference tenant as *"Lead→Tour
unreachable; the Lead outcome targets `qualification`, which is absent."* **On this staging seed that is stale.**
`VERIFIED`: the seeded process has a real `lead_to_tour` transition with outcome rules (`reached_family`,
`interested` → Tour); there is no `qualification` stage; Lead→Tour→Decision is coherent. The reference repair (M3)
is largely **done** at the front of the journey.

The journey still does not complete — but for **different, precisely located reasons** than the stale framing
says. This report replaces "the tenant is broken" with the actual per-transition defects. That the earlier
finding aged out is itself the Product Office's own lesson: *verify what is live before trusting what is written.*

---

## Deliverable 1 — Operator Journey Audit

Legend: ✅ Working · ◐ Partially working · ✗ Missing · ⚠ Incorrect · ✎ Needs polish.

| # | Transition | Verdict | What the operator actually experiences |
|---|---|---|---|
| 1 | **Lead Created** | ✅ | `create_lead` action (command rail + drawer) creates an `open`/`lead` opportunity. Clear, works. Minor: two "new lead" status notions (`new_inquiry` vs `open`) coexist (✎). |
| 2 | **Family Created** | ✅ (not distinct) | Family (customer + guardians) is created **inside** `create_lead`'s household commit. Coherent, but not independently addressable — there is no "add a family later" surface. |
| 3 | **Children Added** | ◐ | Multi-child works when entered as drawer selection records. **The paste/intake path is single-child** (`createLeadIntakeFieldMap.ts` has only singular `child:*` keys) — pasting a 3-child inquiry silently captures one. This is the M4 "two field names for three children" gap, at the intake layer. |
| 4 | **Tour Scheduled** | ◐ / prod-risk | The operator can book a tour (mature tours engine; confirm/cancel/complete/no-show/reschedule all exist). **But** confirming a booking sets `status=tour_scheduled` and does **not** move `stage` off `lead` — stage advances only when the operator separately records a Lead stage outcome. And a shipped migration **deletes** the `tour_scheduled/tour_completed` statuses the tour code still writes — the seed skips that migration, so it works here but **throws in any fully-migrated environment** (`⚠` latent regression). |
| 5 | **Tour Completed** | ◐ | Two non-converging "complete" concepts: completing the *booking* ≠ advancing the *stage*. To reach Decision the operator must **also** record the `tour_completed` stage outcome — two surfaces, two clicks, easy to strand a record in `tour`. When the stage outcome is used, downstream (follow-up task on no-show, needs-attention overlay) is correct and config-driven. |
| 6 | **Decision Made** | ◐ | Family-level decision moves the case (`family_enrolling`→Enrolling, `wants_waitlist`→Waitlist). **`declined` lands the case in a nonexistent stage** (see cross-cutting ⚠1). Per-child branching at Decision is configured (`split_rules`) but only executes coherently from the drawer, not Current Work (⚠2). |
| 7 | **Waitlist** | ◐ | The operator can place a child on the waitlist **from the drawer** with clear child identity. **Managing it from the queue fails**: the configured `offer_spot`→`spot_offered` rule both (a) targets `move_to_stage: "enrollment"` — a lifecycle key, **not a stage** (⚠1), and (b) errors in Current Work because the work subject has no child id (⚠2). |
| 8 | **Offer Extended** | ✗ | **Does not exist as a product step.** `offer_pending` appears in queue filters and status vocabulary but **nothing writes it** — no offer object, no "extend offer" action, no family-facing surface. The journey collapses this into a manual stage move to "Enrolling." |
| 9 | **Enrollment Accepted** | ◐ | Not modeled as an event — the **operator asserts it** by manually moving the child to Enrolling from the drawer (child identity is clear there). No acceptance is captured **from the family**; there is no family-facing accept. |
| 10 | **Agreement Created** | ◐ / off-process | An `approve_enrollment` admin action materializes a real per-child agreement + placement + schedule. **But it is off-process** — the seeded Enrolling stage dead-ends at "Send Enrollment Packet" with no configured path to Enrolled; the agreement is a **legacy admin action bolted onto a status write**, not BP-driven. And "agreement" is an **internal ops record — no send-to-family, no signature/e-sign** exists anywhere. |
| 11 | **Placement Assigned** | ◐ | Real effective-dated `child_placement` (supersede-not-patch), created at handoff and editable in a child-drawer panel. **Gated by a feature flag that is OFF by default**, and **silently skipped** if the enrollment carries no program/room facts (operator learns only via a warning chip). |
| 12 | **Schedule Assigned** | ◐ | Genuine child schedule assignment (distinct from vendor/tour scheduling), materialized at handoff, editable in the drawer. Same flag gate; **silently skipped if the site has no matching schedule pattern**, and the operator can't create the pattern from the flow. |
| 13 | **Current Work Completed** | ✅ | The enrollment process instance reaches terminal `enrolled` via a BP-configured stage rule; agreement provenance is back-stamped. The process/agreement ownership boundary is implemented cleanly. |
| 14 | **Operational Handoff** | ✅ backend / silent surface | Materialization (agreement→placement→schedule + summary event) is idempotent and event-emitting. **But it runs as a silent side effect** of approve/stage-move (failures swallowed to `console.error`), has **no operator readout**, and **does not run at all when the flag is off** — the operator gets an "enrolled" status with no operational reality and no signal anything is missing. |
| 15 | **Attendance Ready** | ◐ / no UI | The enrolled child **is** attendance-ready in the read models, and a record API exists — but there is **zero operator UI**. An operator **cannot record a check-in or view attendance from the product.** Staffing compliance is a `null` placeholder (no staff-scheduling capability). |
| 16 | **Billing Ready** | ◐ / preview only | Config + rate resolution + draft-charge **preview** + a readiness card exist. **No posting** — no invoice, AR, or ledger write. **The operator cannot bill the family.** The billing card also reads the OCM *proposal* grain, not the committed placement (a provenance mismatch). |

### The two structural truths beneath the table

**A · Everything real lives in the Opportunity Drawer or a legacy admin action — not in Current Work.**
`VERIFIED`: the stage-work execution subject is built with only `journey_segment` + `opportunity_id`
(`projectStageWorkRuntime.ts:156-164`); it never carries a child id. The generic outcome executor *requires* one
(`stageOutcomeRuleTargetExecutor.ts:112` → *"Could not resolve child for enrollment state update"*). So **any
child-grain outcome completed from Current Work / the Focus Panel errors**, and the operator must fall back to the
drawer for all child work. The queue *knows* the child (`childGrainEnrollmentQueue.ts`); the work kernel throws it
away. This is M4 (child attention) and M1-B (grain) localized to one seam — and it is the single biggest gap
between "the product has the capability" and "the operator can use it."

**B · Two dangling targets in the reference config break the close and offer paths.** `VERIFIED`:
(1) every "Close as Lost" outcome on lead/tour/decision targets `closed_lost`, which is **not one of the 8 stages**
(the real stage is `closed`) — a lost family is moved to an orphan stage with no queue membership or work.
(2) the waitlist `offer_spot` rule targets `move_to_stage: "enrollment"` — the **lifecycle key, not a stage**.
Both are the M1-C legacy raw-destination pattern, and both survive in the seed the runtime work shipped.

---

## Deliverable 2 — Product Gaps by capability (remaining engineering only)

**Business Process / Stage / Outcomes**
- Repair the two dangling targets: `closed_lost` → `closed`; waitlist `offer_spot` → the `enrolling` stage (config/data). *Until fixed, "close as lost" and "offer a waitlist spot" both corrupt state.*
- Bring the Enrolling→Enrolled + agreement step **on-process**: a configured transition/approve outcome in the operating plan, replacing the off-process legacy `approve_enrollment` admin action.
- Reconcile the two queue models — collapsed `case_status` work-surface filters vs. builder `queue_membership_v1` by stage (the Follow-Up lane currently matches nothing and reads empty).

**Current Work / Focus Panel** *(the highest-leverage fix)*
- Thread child identity into the stage-work execution subject so child-grain outcomes complete from Current Work without erroring, and the affected child is **named** in the work item, blockers, and actions before execution.
- Converge stage grain ≡ `journey_segment` (the seed's `enrolling` stage is `grain:child` but `journey_segment:family`), so child-track work resolves.
- Restore Summary as a distinct mode and give the Frame a visible "why am I here" (M5) — the panel currently ships a temporary two-mode model.

**Actions / Outcomes**
- A single action-availability gate so a Process-Action-disabled capability disappears from Current Work too (the runtime fallback still offers disabled actions).

**Scheduling**
- Reconcile tour **booking** with **stage** movement so completing a tour advances the case in one operator action; fix the tour code's incompatibility with the collapsed `{open,closed}` status model (a production regression today).
- Let the operator create a missing schedule **pattern** in-flow (today a missing pattern silently skips schedule assignment).

**Communications**
- Wire the family-facing steps that don't exist: tour confirmation/reminder **template rendering** (placeholders today), the **offer** send, and the **agreement** send. The channel is production-hardened; the enrollment-specific messages are not composed.

**Configuration / Commercial**
- Replace the single "Healthy/not_assessed" verdict with the 5-level certification the product requires, so an operator is told truthfully whether a configured journey works (M2). Fold Locations' self-issued certification into it.

**Operational enrollment (Placement / Schedule / Handoff)**
- Resolve the default-OFF feature flag (a product decision to make it permanent), give the handoff an operator-visible readout, and make placement/schedule skips **legible** instead of silent.

**Attendance**
- Build the operator UI over the existing backend: check-in/out capture, the Attendance tab/Focus-Panel read model, variance and compliance review. Add a staff-scheduling data source (compliance is structurally blocked without it).

**Billing**
- Build the posting path: draft charge → **invoice → AR → payment**, so the operator can actually bill an enrolled family. Reconcile the billing card to committed placement grain, not the OCM proposal.

**Operational Intelligence / Numbers**
- Give every operator-facing number its provenance (cohort/grain/window/source) and enforce count↔row parity, so the pipeline, roster, and attention counts on the landing screen agree (M6).

**Certification environment**
- Generalize the working Processing cert stack into a disposable enrollment-journey environment with valid **and intentionally invalid** configs, and make cert **fail loudly** when absent — so each wave below is proven by executing the journey, not by inspection (M7).

---

## Deliverable 3 — Product Realization Waves

Organized around **delivering a working operator journey**, sequenced by dependency — not around M1–M8. Each wave
moves the "furthest an operator can get unaided" marker measurably down the journey.

### Wave 0 — Provable ground *(prerequisite)*
**Objective:** the journey can be run and proven end-to-end on a disposable tenant.
**Work:** generalize the certification environment (valid + invalid configs, fail-loud); ratify the reference
config as the certification fixture.
**Outcome:** every later wave is accepted by *executing* the journey, not inspecting it.
**Operator marker:** unchanged — this is the harness.

### Wave 1 — One operator, one surface, front-to-Enrolling
**Objective:** an operator drives Lead → Tour → Decision → Enrolling **entirely from Current Work**, naming the
child, with no errors and no dead-ends.
**Depends on:** Wave 0.
**Work:** thread child grain into the stage-work subject (kills "Could not resolve child"); converge grain ≡
journey_segment; repair both dangling targets (`closed_lost`, waitlist `enrollment`); converge tour booking with
stage movement + fix the collapsed-status regression; reconcile the two queue models.
**Outcome:** the front half is **✅**, and child-grain work completes from the primary surface.
**Operator marker:** inquiry → a correctly-staged, child-identified enrolling case, unaided.

### Wave 2 — Model Offer & Acceptance as product
**Objective:** Offer Extended and Enrollment Accepted become real, configuration-driven, child-identified states —
and the agreement is created on-process.
**Depends on:** Wave 1 (child identity in the work surface).
**Work:** an offer object + "extend offer" action (writes `offer_pending`) + a family-facing accept (or explicit
operator-accept); a configured Enrolling→Enrolled/agreement transition replacing the legacy admin action; the
offer/agreement **sends** via Communications; agreement documents (send/sign) if the product requires signature.
**Outcome:** steps 8–10 move from ✗/off-process to ✅.
**Operator marker:** the family receives an offer, accepts, and an agreement exists — through the product.

### Wave 3 — Operational reality, made visible
**Objective:** completing enrollment produces a **visible, correct** placement + schedule + handoff.
**Depends on:** Wave 2 (a real accepted agreement to hand off).
**Work:** resolve the default-OFF operational-enrollment flag; give the handoff an operator readout; make
placement/schedule skips legible; allow in-flow schedule-pattern creation.
**Outcome:** steps 11–14 are ✅ and the operator can *see* the operational record they created.
**Operator marker:** an enrolled child is really placed and scheduled, on screen.

### Wave 4 — Operate the enrolled child: Attendance + Billing
**Objective:** the enrolled child can be **attended and billed** — the business actually runs.
**Depends on:** Wave 3 (a placed, scheduled child).
**Work:** the attendance operator UI over the existing backend + a staff-scheduling source; the billing posting
path (charge → invoice → AR → payment) + billing-card grain reconciliation.
**Outcome:** steps 15–16 move from preview/no-UI to ✅.
**Operator marker:** an enrolled child is checked in and issued a real charge — inquiry-to-cash, unaided.

*(Cross-cutting through every wave: number provenance (M6) and the M2 certification verdict harden the numbers and
the "is this configured correctly?" answer the operator sees. They are folded into each wave's acceptance rather
than sequenced separately.)*

---

## Deliverable 4 — Definition of "Enrollment Product Complete"

Enrollment is complete when **a childcare operator moves a real family from first inquiry to a billable enrolled
child using only the product — no engineer, no API call, no SQL, no feature-flag flip.** Concretely, every
condition below is true:

1. **All 16 transitions are ✅** — none Partial, Missing, or Incorrect — exercised as one continuous journey.
2. **One surface.** The operator completes every step from Current Work / the Focus Panel and the drawer as a
   coherent whole; **no child-grain action errors**, and nothing forces a drop to a legacy admin action.
3. **The child is always named.** At every child-grain step, the requirement, blocker, and action state which
   child they concern before execution; siblings are distinguishable.
4. **Business Process Configuration drives every transition** — including Offer, Acceptance, and Agreement. Nothing
   load-bearing is off-process or hardcoded.
5. **No dangling targets.** Every outcome and every close lands in a real stage; no orphan states.
6. **The surfaces reflect reality after each action** — Current Work updates, the Focus Panel shows the true state,
   the Queue moves, and Stage movement occurs, on the same action, without a second reconciling click.
7. **Completing enrollment produces real, visible operational consequences** — placement, schedule, and a handoff
   the operator can see — with no silent skips and no hidden feature flag disabling them.
8. **The enrolled child is operable:** attendance can be recorded and reviewed in the product, and a **real charge/
   invoice** (not a preview) can be issued to the family.
9. **Family-facing steps exist** where the journey requires them — the offer is sent, the agreement is delivered,
   acceptance is captured.
10. **Every operator-facing number is honest** — its cohort/grain/source are unambiguous and counts match rows.
11. **The configuration tells the truth about itself** — the operator is shown a truthful certification level, not a
    single "Healthy," and cannot publish a journey that can't be operated.
12. **Proven by executed evidence**, not inspection: the full journey runs green in the certification environment,
    against valid **and** intentionally-invalid configs, on a disposable tenant.

**Today, none of 1–12 is fully true.** The nearest — the front half — is ◐ because tour/stage are decoupled and the
child-grain surface errors. The furthest — attendance and billing — have real backends but no operator path. The
gap is not architecture; it is **realization**: connecting a genuinely-built substrate to a single, honest,
child-aware operator surface, and lighting up the last mile the operator cannot currently reach.

---

**Reconciliation complete. No implementation begun. Awaiting review.**
