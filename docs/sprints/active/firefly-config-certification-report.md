---
owner: engineering
status: certification
last_reviewed: 2026-07-24
supersedes: []
---

# Firefly Operating Configuration — Certification Report

The platform is treated as a Release Candidate. This pass certifies the **Firefly operating
configuration** — the tenant metadata that drives it — not the runtime. Every finding is
classified:

- **Tenant configuration** — the runtime faithfully executes what is configured; the
  configuration itself does not match Firefly's intended operating model.
- **Platform defect** — the runtime violates *valid* configuration.

Configuration was captured live from the running tenant (Firefly Early Learning, org
`93667019…`, department "Enrollment" `3933ac47…`, process `enrollment`) to
`docs/sprints/active/assets/firefly-config/inventory.json`. Observed runtime behavior was
derived by running each real plan through the same matcher + transition resolver the
**already-certified** transaction engine uses (`tests/lifecycle/fireflyConfigCertification.test.ts`,
13 tests) — so no live family record was mutated to produce it.

**Source of truth:** the tenant runs a *published* plan under
`departments.metadata.lifecycle_builder_v1`, which **shadows** the code defaults entirely. All
findings below are about the published tenant plan.

---

## Configured process — inventory

One process, `enrollment`, **6 stages**: `lead → qualification → tour → waitlist → enrollment
→ enrolled`. (Note: `qualification` sits in the pipeline but is empty — §Stage 2.)

| Stage | Work templates | Outcomes | Outcome rules | Transitions | Attention rules |
|---|---|---|---|---|---|
| lead | Contact Family (3-attempt/7-day, repeat 2d) | 5 | 6 | none | 5 |
| qualification | **none** | **none** | **none** | **none** | none |
| tour | Schedule / Confirm / Conduct Tour | 11 | 8 | 2 (→ waitlist, → **decision**) | none |
| waitlist | Review position, Offer spot | 3 | 3 | none | none |
| enrollment | Send packet, Confirm start | 3 | 3 | none | 1 |
| enrolled | none | 1 (Acknowledged) | 1 (no-op) | none | none |

**Forms:** 5 active (`Firefly New Lead Inquiry`, `Missouri State Medical Form`, `Lead
Enrollment Inquiry`, `Lead Form`, `New Lead Gen`); 3 published. All are `kind: center` intake
forms bound to the `lead` stage.

**Communications automation:** none configured at the stage level. Family communication is
operator-initiated (the Message capability). Tour comms run through the separate tour-comms
orchestrator (best-effort, gated by its own per-org binding).

**Business Process automation:** entirely `outcome_rules` + `attention_rules` on each stage
(inventoried above). No status-entry or domain-signal automation is configured on any stage
except what the code default would supply — and the published plan overrides those.

---

## Findings

Each finding follows the required format. Severity is for Firefly's operating model, not the
platform.

### Stage 1 — LEAD

#### F1. `left_message` reopens contact work forever — the funnel never escalates *(tenant configuration, HIGH)*

- **Current configuration:** `left_message_repeat`: `when_outcome_key: left_message → reopen_work`. No attempt gate. The work template configures `max_attempts: 3`.
- **Observed runtime behavior:** at attempt 1 and at attempt 3 (the configured cap) the outcome resolves identically to `reopen_work` and pushes `due_at` out another 2 days. *Certified:* `fireflyConfigCertification` — "left_message reopens with NO attempt cap". A lead you keep leaving messages for loops in "Contact Family" indefinitely and never surfaces for escalation.
- **Expected operator behavior:** after the configured number of attempts, the lead should escalate (needs-attention) rather than silently re-queue forever.
- **Configuration gap:** the gate that the *sibling* outcome already uses is missing here. `unable_to_reach` is configured with `unable_repeat (when_attempt_count_lt: 3)` + `unable_attention (when_attempt_count_gte: 3)` — it escalates correctly (*certified*). `left_message` was authored without that split.
- **Recommended configuration change:** split `left_message` the same way — `reopen_work` while `when_attempt_count_lt: 3`, `create_needs_attention` when `when_attempt_count_gte: 3`. No platform change.

#### F2. Reaching/qualifying a lead moves it into an empty stage *(tenant configuration, HIGH)* — see Stage 2

- **Current configuration:** `reached_move`: `reached_qualified → update_family_case_status:open, move_to_stage:qualification, mark_stage_work_complete`.
- **Observed runtime behavior:** the family's `stage_key` becomes `qualification`, a configured stage with **no operating plan** (F4). *Certified:* the move resolves cleanly; qualification's plan is null.
- **Expected operator behavior:** a qualified family should land somewhere with a next action — either a real Qualification stage with work, or straight into Tour.
- **Configuration gap:** the destination stage exists in the pipeline but carries no work/outcomes/transitions.
- **Recommended configuration change:** either give `qualification` an operating plan, or retarget `reached_move` to `move_to_stage:tour` and remove the empty qualification stage. Firefly's product decision.

### Stage 2 — QUALIFICATION

#### F3. Qualification is a pipeline stage with no operating model *(tenant configuration, HIGH)*

- **Current configuration:** stage present in `lifecycle_builder_v1` (stage_count 6), but `stage_operating_plan` is **null** (both in the tenant metadata and the code default — the code comment says qualification was "folded into Lead").
- **Observed runtime behavior:** any family in `qualification` (reachable via F2) has no configured work, no outcomes, no transitions, and no attention rules. What's Next has nothing to offer. *Certified:* `qualification` is in the configured stage set and its plan is null.
- **Expected operator behavior:** either qualification is a real step with work, or it does not exist in the pipeline.
- **Configuration gap:** an inhabited-but-empty stage.
- **Recommended configuration change:** decide qualification's role (see F2) and either author a plan or remove the stage and repoint the lead rule. Product decision.

### Stage 3 — TOUR

#### F4. Two "Tour Completed" outcomes strand the family in a stage that does not exist *(tenant configuration, CRITICAL)*

- **Current configuration:** `outcome_7 (Tour Completed — Interested)` and `outcome_8 (Tour Completed — Needs Follow-up)` both fire `move_to_stage` via `tour_transition_2`, whose `target_stage_key` is **`decision`**. `decision` is not one of the 6 configured stages.
- **Observed runtime behavior:** the transition resolves without error (it is a declared transition, marked available), so the certified engine really writes `stage_key = "decision"`. The family leaves the tour stage and lands in a stage absent from the pipeline — it appears in no configured stage queue. The destination stage-entry work spawn finds no plan and soft-fails (now surfaced as a *degraded* effect, not swallowed). *Certified:* both outcomes resolve to `move_to_stage:decision`; `decision ∉ configured stages`.
- **Expected operator behavior:** completing a tour with an interested family should advance them toward enrollment/waitlist — a real stage.
- **Configuration gap:** `tour_transition_2.target_stage_key` points at a stage the tenant does not have. This is the single most damaging config error found: the primary happy-path tour outcome removes the family from the pipeline.
- **Recommended configuration change:** repoint `tour_transition_2` to a configured stage (`enrollment` for "Interested", or `waitlist` if capacity-gated). No platform change — the engine did exactly what the transition said.

#### F5. Three tour outcomes do nothing; one is a labelled no-op *(tenant configuration, MEDIUM)*

- **Current configuration:** `outcome_3 (Family Declined Tour)`, `outcome_6 (Tour Confirmed)`, `outcome_9 (Tour Rescheduled)` have **no outcome_rule**. `outcome_1 (Tour Scheduled)` and `outcome_11 (Tour Cancelled)` map to `no_movement`.
- **Observed runtime behavior:** recording any of these advances nothing. `Family Declined Tour` is even flagged `completes_work + successful` but has no rule to close/relocate the case. *Certified:* the three unruled outcomes are enumerated; `outcome_1 → no_movement` only.
- **Expected operator behavior:** "Family Declined Tour" should close or waitlist the case; "Tour Confirmed" / "Tour Rescheduled" should at least be observable.
- **Configuration gap:** outcomes authored without rules; the tour stage is a half-built builder artifact (generic `outcome_1…11`, `work_1…3` labels).
- **Recommended configuration change:** author rules for the meaningful outcomes and delete the vestigial ones. Product/config cleanup.

#### F6. The Schedule Tour *capability* and the tour *stage outcomes* are two disconnected systems *(tenant configuration, MEDIUM — carries prior B2)*

- **Current configuration:** booking a tour (the Schedule Tour capability) emits the `{tour_booking, scheduled}` domain signal. The tour stage's rules are all `when_outcome_key`; none are `when_domain_signal`.
- **Observed runtime behavior:** a confirmed booking matches zero tour-stage rules and advances nothing; separately, an operator can record a `Tour Scheduled` *outcome* that also does nothing (F5). The live Wenc lead has a confirmed tour (27 Jul 2026) and is still in `lead`. *Certified:* the tour plan has no domain-signal rules.
- **Expected operator behavior:** booking a tour should move the family into/through the tour stage without a second manual outcome.
- **Configuration gap:** no `when_domain_signal: {tour_booking, scheduled}` rule bridges the booking capability to the stage machine.
- **Recommended configuration change:** add a domain-signal rule on the appropriate stage. (Note the tenant-plan-shadows-code-default and migration-clobber hazards documented in `phase-5-platform-transaction-contract.md` §3.) Product decision, deferred by instruction.

### Stage 4 — WAITLIST *(no defect)*

- **Configuration → observed:** `spot_offered → update_child_enrollment_status:offer_pending, move_to_stage:enrollment, mark_stage_work_complete`. Resolves cleanly to a move to the configured `enrollment` stage. `candidate_paused → update_candidate_status`; `no_response → create_needs_attention`. *Certified.* Matches the intended model.

### Stage 5 — ENROLLMENT *(no defect)*

- **Configuration → observed:** `enrollment_complete → update_child_enrollment_status:enrolled, move_to_stage:enrolled, mark_stage_work_complete`. Resolves cleanly to `enrolled`. `packet_pending → create_needs_attention`; `family_withdrew → update_child_enrollment_status:not_enrolling, mark_stage_work_complete`. *Certified.* Matches the intended model.

### Stage 6 — ENROLLED *(no defect)*

- Terminal stage; single `acknowledged → no_movement` outcome. Appropriate for a post-enrollment follow-up stage.

### Cross-cutting — FORMS

#### F7. Send Form showed "no forms" despite 5 published forms *(PLATFORM DEFECT — FIXED)*

- **Current configuration:** 5 active forms, 3 published, bound to the lead stage.
- **Observed runtime behavior (before):** the Send Form host rendered *"No active forms are configured for this organization."*
- **Root cause:** `/api/admin/forms` answers `{ data: FormRow[] }` (an array under `data`), but `FormDeliverySurface` and `formDeliveryWarmCache` read `j.forms ?? j.data?.forms` — neither key exists on an array, so the list was always empty **regardless of configuration**. The runtime was hiding valid configuration.
- **Classification:** platform defect — the runtime violated valid configuration. This **corrects the prior report's C1**, which mis-classified the empty state as tenant configuration.
- **Fix:** both read sites now accept the array-under-`data` shape (commit `52ba4e634`). **Verified live:** the host now lists all five forms.
- **Residual (tenant configuration):** the forms are all intake forms bound to `lead`; whether each is appropriate to *send* to a family is a tenant curation question, not a platform one.

---

## Certification Matrix — configuration by stage

| Stage | Actions | Outcomes | Transitions | BP rules | Comms | Forms | Automation | Matches intended model | Certified |
|---|---|---|---|---|---|---|---|---|---|
| lead | ✔ | ✔ | n/a | **partial (F1)** | operator-only | ✔ | **partial (F1)** | **NO** | **NO** |
| qualification | **empty (F3)** | **empty** | **empty** | **empty** | — | — | **empty** | **NO** | **NO** |
| tour | ✔ | **partial (F5)** | **broken (F4)** | **partial (F4/F5)** | orchestrator | ✔ | **broken (F4)** | **NO** | **NO** |
| waitlist | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | YES | **YES** |
| enrollment | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | YES | **YES** |
| enrolled | ✔ | ✔ | n/a | ✔ | — | — | ✔ | YES | **YES** |

**3 of 6 stages certified.** The three failures are all tenant configuration except the
forms-reader bug (F7), which was a platform defect and is fixed.

---

## Platform defects vs tenant configuration — summary

**Platform defects (runtime violates valid configuration):**
- **F7** — Send Form hid all configured forms. **Fixed + verified** (`52ba4e634`).

That is the only platform defect found in this pass. Everything else is tenant configuration:

**Tenant configuration gaps (the runtime is faithful; the config is wrong for Firefly):**
- **F4 (CRITICAL)** — tour "Interested/Follow-up" outcomes move the family to a non-existent
  `decision` stage → family leaves the pipeline.
- **F1 (HIGH)** — `left_message` never escalates.
- **F2 / F3 (HIGH)** — reaching a lead lands it in an empty `qualification` stage.
- **F5 (MEDIUM)** — three tour outcomes have no rule; "Family Declined" doesn't close.
- **F6 (MEDIUM)** — booking a tour advances nothing (no domain-signal rule).

Per instruction, no tenant configuration was changed automatically.

---

## Release recommendation (Firefly operating model)

Booking or completing a tour is the center of a childcare enrollment funnel, and on Firefly's
current configuration:

- completing a tour with an interested family **removes them from the pipeline** (F4),
- booking a tour **advances nothing** (F6),
- a lead you keep missing **loops forever** (F1),
- qualifying a lead **drops it into an empty stage** (F2/F3).

The **platform** is behaving correctly — every one of these is the engine faithfully executing
what Firefly configured, and the one true platform bug (F7) is fixed. But the **Firefly
configuration** is not ready to operate a center. Waitlist → Enrollment → Enrolled is sound;
the Lead → Qualification → Tour front half is not.

**Recommendation: the platform is a viable RC; the Firefly tenant configuration is NOT
production-ready.** The blocking configuration change is F4 (repoint `tour_transition_2` off
`decision`); F1, F2/F3, F5, F6 follow. All are tenant-configuration edits — none require code.

---

## How to re-run

```bash
# Live inventory (read-only):
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json npx playwright test playwright/tests/firefly-config-inventory.spec.ts --workers=1
# Observed-behavior certification (deterministic, against the captured inventory):
cd web && npx vitest run tests/lifecycle/fireflyConfigCertification.test.ts
```
