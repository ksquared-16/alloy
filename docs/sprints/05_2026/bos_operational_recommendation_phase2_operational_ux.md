# BOS Operational Recommendation Intelligence — Phase 2 Operational UX Sprint

**Path:** `docs/sprints/05_2026/bos_operational_recommendation_phase2_operational_ux.md`  
**Status:** Planning — **audit + design only** (no implementation in this doc)  
**Date:** 2026-05-21

**Binding inputs:**

| Doc | Role |
|-----|------|
| [`bos_operational_recommendation_intelligence_sprint.md`](./bos_operational_recommendation_intelligence_sprint.md) | Program audit, recommendation framework, phase map |
| [`bos_operational_recommendation_intelligence_gate0.md`](./bos_operational_recommendation_intelligence_gate0.md) | Doctrine — assistive only, no autonomy |
| [`bos_operational_recommendation_phase1_execution.md`](./bos_operational_recommendation_phase1_execution.md) | Phase 1 closeout (§12) — **COMPLETE** |

**Phase:** 2 — Operational recommendation UX + hierarchy  
**Blocks:** Phase 3 workflow/comms wire, Phase 4 AI enrich (unchanged)

**Phase 2 is still deterministic operational intelligence.** No AI enrich, no LLM reasoning, no autonomous behavior, no recommendation generation in UI, no workflow mutation, no persistence.

---

## Program goal (Phase 2)

Transform recommendations from **structurally correct and technically grounded** (Phase 1) into **operationally prioritized, visually compressed, explainable, urgency-aware, action-oriented, and trustworthy** judgment support.

Operators should feel: *“I know what matters, what to do next, and why — without reading a wall of text.”*

Not: a suggestion feed, a chatbot, or a label dump.

---

# STEP 0 — Phase 1 UX audit (current state)

Audit based on shipped Phase 1 code paths (selectors, render projections, primary consumers). This is a **gap analysis**, not a full UI redesign audit.

## 0.1 Surfaces inventoried

| Surface | Primary component / module | Data read today | Phase 1 canonical fields used? |
|---------|---------------------------|-----------------|------------------------------|
| **Queue preview (scan lane)** | `QueueBlock` → `CrmCompactQueuePreview` | `getRecommendationQueuePreview` → VM `attentionSuggestionPreview` | Yes — `nextLabel`, `whyLine`; **`urgency_band` attached but not rendered** |
| **Queue attention headline** | Same row | `buildQueueOperationalAttentionPresentation` → `attentionReason` | Resolver label only — parallel to recommendation, can duplicate story |
| **Queue priority line** | Same row | `buildQueueRowPriorityExplanationLine` | Deterministic score/SLA hint — **separate** from recommendation preview |
| **Queue operational summary** | Same row | `_operational_summary_preview` | Separate aggregate — can compete with recommendation strip |
| **Drawer strip (chrome)** | `OperationalAttentionHeaderStrip` | `getRecommendationDrawerStrip` + legacy `_attention_suggestion` | Partial — uses `nextActionLabel`, `whyLine`; **does not surface `title`, `urgency_label`, `urgency_reason`, `outcome_line`, `signal_labels`** |
| **Drawer without recommendation** | Same | `nextStepGuidance` + resolver factors | Fallback path still feels like **labels + generic next-step template** |
| **Drawer draft / enhance** | `OperationalAttentionEnhanceDraft` | Legacy `_attention_suggestion.suggested_content` + enrich route | **Pre-existing** template draft + optional AI enhance — out of Phase 2 recommendation scope but visually adjacent |
| **Handoff / Orchestrator seed** | `buildOperationalRecommendationHandoffCopy`, `orchestratorHandoffSeedCommand` | `getRecommendationHandoff` → legacy fallback | Yes for canonical when present — **title-led handoff**, not full anatomy |
| **Active operational context** | `activeOperationalContext.ts` | Handoff + entity label | Seed string only — no urgency/outcome |
| **BOS proposal cards** | `OperationalProposalCardFrame` (config/job/workflow) | Governed proposals — **not** wired to `OperationalRecommendationV1` yet | N/A for Phase 2 card 2.4 |
| **Operational attention panel** | `OperationalAttentionDrawerPanel` | Resolver payload | Duplicate primary/next when strip shows suggestion |

**Authority (unchanged, verified):** Entity GET = full `_operational_recommendation`; queue = preview only; resolver = `_operational_attention`.

---

## 0.2 Ten audit findings (operator experience)

### 1. Where recommendations still feel mechanical

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Drawer headline still resolver-first | `Needs attention: ${primary.label}` dominates strip | UI layout predates canonical **title** as judgment headline |
| Queue shows “Alloy suggestion” chip | `QueueBlock` copy | Product framing reads as **feed item**, not operational judgment |
| Dual “next” lines on queue rows | `attentionSuggestionPreview` + `operationalNextHint` + `nextStep` field | Multiple deterministic sources not **merged into one sequencing line** |
| Handoff uses title OR action inconsistently | `render.handoff.primary_recommendation` prefers catalog title | Good copy, but operator may not see same phrase in drawer |
| Fallback strip uses `nextStepGuidance` templates | When no recommendation/suggestion | Generic enrollment templates — not catalog-backed |

**Phase 2 fix direction:** Lead with **catalog title + urgency + one action line** at L1; demote resolver label to supporting context or L2.

---

### 2. Where urgency is unclear

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| P0–P3 not visible in drawer L1 | `drawer_strip.urgency_label` / `urgency_reason` exist but unused in UI | Selector returns fields; component does not render them |
| Queue ignores `urgency_band` | `ResolvedQueueRecommendationPreview.urgencyBand` populated, never passed to VM/CSS | Missing wire from selector → `CrmCompactRowSemanticSlots` |
| Row `urgencyTier` is queue-sort artifact | Card rail uses job/opportunity queue priority, not recommendation band | Two urgency systems can **conflict visually** |
| Escalation type invisible at L0 | `recommendation_type: escalation` only in full DTO / preview metadata | No type chip at queue or drawer L1 |
| SLA breach not distinguished from “needs attention” | `attentionReason` and recommendation why both stress urgency without band hierarchy | No single **urgency chip** grammar |

**Phase 2 fix direction:** One **recommendation urgency chip** per surface level; align color grammar with GATE 0 §6.2 (P0 strongest, P3 collapsed).

---

### 3. Where escalation is weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| `sla_breach` catalog is strong; UI does not say “escalation” | `recommendation_type === escalation` + `escalation_reference` on DTO | No escalation-specific L1 treatment |
| Policy basis not shown | `escalation_reference.policy_basis` in contract | Not in any projection consumer |
| Drawer treats escalation like operational follow-up | Same strip layout for all types | No visual or copy distinction for **leadership visibility** |

**Phase 2 fix direction:** When `recommendation_type === escalation`, show **policy basis line** at L1 (truncated) + distinct chip (not red entire card).

---

### 4. Where multiple factors are poorly represented

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Secondary reasons as comma-separated footnote | `factorsJoined` in strip | Readable but **flat** — no severity/SLA per factor |
| `drawer_strip.signal_labels` unused | Up to 2 labels in projection | Not rendered in L1 |
| `render.detail` unused | Built when `secondary_factors.length > 0` | **No L2 UI** wired to `getRecommendationDetailSummary` |
| Queue has no factor preview | Preview DTO is 4 fields | By design — but operator discovers factors only after expand/hunt |

**Phase 2 fix direction:** L1 shows **primary factor only**; L2 expand shows factor list + capped signal labels; never dump all reasons inline on scan lane.

---

### 5. Where recommendations are too verbose

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Queue `why_line` up to 140 chars + full catalog clauses | `why_it_matters` template interpolation | Correct but dense in scan context |
| Drawer shows full `why_it_matters` up to 220 chars | `conciseWhy` truncation only | Still long when catalog includes days/timing clauses |
| Stack of 4–5 lines on scan rows | attention headline + priority explanation + summary preview + suggestion block | **Cognitive stacking** without collapse rules |
| `operational_summary_preview` adjacent to recommendation | Separate “Read” strip | Two narratives on one row |

**Phase 2 fix direction:** **Compression rules per level** (see §1.1); collapse summary preview when recommendation preview present; shorten L0 why to one clause.

---

### 6. Where recommendations are too shallow

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Queue shows action label only | `next_label` without outcome | Preview DTO does not include outcome (intentional) — operator must open drawer |
| No outcome at L1 drawer | `outcome_line` in selector, not rendered | Missing UI |
| No timing recommendation | `communication_reference.timing_hint` on DTO | Not projected to strip |
| No “what happens if I wait” | `likely_risk` on DTO | Only in `render.detail`, no UI |
| Unsupported reasons → null recommendation | Mapper fail-soft | Row falls back to legacy/generic — feels **empty** not “unsupported” |

**Phase 2 fix direction:** L1 adds **one outcome clause**; L2 adds risk + timing; queue tooltip points to drawer for full judgment.

---

### 7. Where operator action sequencing is unclear

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| “Next ·” vs “Suggested next step ·” vs queue “Next:” | Different labels across surfaces | No shared **sequencing vocabulary** |
| `recommended_action` vs resolver `nextStepGuidance` divergence | Two pipelines | Phase 1 switched data source but not **unified sequencing copy** |
| `available_actions[]` invisible | On full DTO only | Operator does not see alternates without reading JSON |
| Communication vs operational type not actionable in UI | `recommendation_type` not surfaced | Operator cannot infer **channel/timing** at a glance |

**Phase 2 fix direction:** Standardize on **“Do next”** (action) + **“Why now”** (urgency/timing) + **“If successful”** (outcome) grammar across L0–L2.

---

### 8. Where BOS still feels like “labels”

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| `attentionReason` = resolver reason label | Queue scan headline | Not the catalog **judgment title** |
| Status pills vs recommendation disconnected | CRM status pill separate from recommendation urgency | Visual silos |
| “Alloy suggestion” branding | Queue chip text | Implies product feature, not **operational assessment** |
| Primary drawer headline is attention code label | `Needs attention: Follow-up overdue` | Reads like queue taxonomy, not coaching |

**Phase 2 fix direction:** Promote **`title`** (catalog judgment headline) to primary visible line; demote reason code labels to L2/support.

---

### 9. Where reasoning hierarchy is weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Flat “Why ·” paragraph | Single block | No visual separation of **matter / urgency / rationale** |
| `action_rationale` never shown at L1 | In `render.detail` only | Operator does not see **why this action** vs **why it matters** |
| `current_state_summary` unused in strip | On DTO, not in selector VM | State vs judgment collapsed |
| Confidence only as “Approximate timing” | When `confidence_level === low` | No positive high-confidence affordance |

**Phase 2 fix direction:** L1 three-line anatomy: **Headline (title)** → **Why now (urgency_reason + why_it_matters clause)** → **Do next (action)** → optional **Likely (outcome)**.

---

### 10. Where recommendation trust is visually weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Stale banner on DTO, rarely seen | `drawer_strip.stale_banner` | `is_stale` always false until live freshness wired |
| No “deterministic” indicator | Phase 1 is deterministic-only on wire | Operators cannot distinguish from future AI polish |
| Grounding signals hidden | `grounding_signals[]` on DTO | No L2 “Based on” list |
| Preview disclaimer only in `title` attr | Tooltip on queue suggestion | Easy to miss — needs **visible preview boundary** copy |
| Enhance draft adjacent to deterministic copy | Same strip | **Trust blur** between deterministic judgment and AI enhance |

**Phase 2 fix direction:** Visible **“Deterministic assessment”** footnote at L1; L2 “Signals” expand; stale banner when `is_stale`; keep enhance visually subordinate.

---

## 0.3 Cross-cutting risks (Phase 2 must guard)

| Risk | Mitigation in Phase 2 |
|------|---------------------|
| **Alert fatigue** | Cap P0 visual weight; one accent per row; no red wash |
| **Recommendation repetition** | Collapse duplicate lines (attention headline vs why); one primary narrative per row |
| **Queue truth drift** | No new queue fields for execution; preview tooltips unchanged |
| **UI copy generation** | All strings from server projections + selectors — **no new template logic in React** |
| **AI scope creep** | Explicit card gate: no enrich route changes in Phase 2 |
| **Density overload on scan lane** | Max 2 recommendation lines at L0; collapse operational summary when preview present |

---

# STEP 1 — Phase 2 UX framework

## 1.1 Recommendation levels (L0–L3)

Aligned with GATE 0 §6.3 and Phase 1 render bundle. Phase 2 **implements** what Phase 1 already projects.

| Level | Surface | Operator job | Max visual weight | Fields shown (deterministic) | Hidden by default |
|-------|---------|--------------|-------------------|---------------------------|-------------------|
| **L0 — Queue preview** | `CrmCompactQueuePreview` scan lane | Choose whether to open record | Low–medium (band-aware) | `title` or `next_label` (one line), `why_line` (one clause, ≤140c), optional **urgency band chip** | Outcome, factors, signals, draft, rationale, escalation policy, score |
| **L1 — Drawer strip** | `OperationalAttentionHeaderStrip` chrome | Understand judgment + next action on open | Medium–high (P0/P1 accent) | `title`, `urgency_label` + `urgency_reason` (one line), `next_action_label`, optional `outcome_line`, optional type chip | Full `why_it_matters`, factors, signals, risk |
| **L2 — Drawer expand** | New or extended panel region (no new route) | Validate reasoning before acting | Medium | `action_rationale`, `secondary_factors[]`, `signal_labels` (capped), `likely_risk`, `communication_reference.timing_hint` (text only), `escalation_reference.policy_basis` when escalation | Raw reason codes, resolver version, priority_score |
| **L3 — Orchestrator / handoff** | Command seed + handoff copy | Continue work in Orchestrator | Low–medium | `handoff.primary_recommendation`, `handoff.operational_reason` (compressed), `cta_label` | Full DTO, chain-of-thought, AI markers |

**Density rules:**

- **One primary narrative** per level — do not show recommendation + operational summary + priority explanation saying the same thing.
- **Truncate with intent** — prefer clause drops over mid-sentence ellipsis where catalog allows shorter template tier for L0.
- **Progressive disclosure** — L2 is collapsed `<details>` or existing drawer section; never default open on every record.

**Action visibility:**

- L0: action as **verb line** (`next_label`), not button.
- L1: action as labeled **“Do next”** row (not “Next ·”).
- L2: `available_actions[]` as **links/intents list** (read catalog labels only — no placement resolution in Phase 2).

**Escalation visibility:**

- L0: chip `Escalation` + shortened why clause when `recommendation_type === escalation`.
- L1: `urgency_label` = Urgent + policy basis subline (from `escalation_reference` or `urgency_reason`).

**Outcome visibility:**

- L0: omit (tooltip: open record for outcome).
- L1: one line `outcome_line` when present (conversion/communication types prioritized).

---

## 1.2 Urgency hierarchy (P0–P3)

**Source of truth:** `OperationalRecommendationV1.urgency` (`p0_urgent` | `p1_today` | `p2_soon` | `p3_fyi`) — already set by builder from severity + SLA + catalog defaults. Phase 2 does **not** change resolver rules.

| Band | Operator meaning | When to emphasize | L0 treatment | L1 treatment |
|------|------------------|-------------------|--------------|--------------|
| **P0 — Urgent** | Act today or escalate now | SLA breached + critical severity; `sla_breach` catalog | Compact chip + left accent (existing attention badge — **align**, do not duplicate) | Strongest border accent; show `urgency_reason` |
| **P1 — Today** | Default coaching window | Most operational attention rows | Standard chip “Today” | Default strip accent |
| **P2 — Soon** | Wait or family clock | Waiting buckets, approaching SLA | Muted chip or icon only | Softer typography |
| **P3 — FYI** | Informational | Activity-only / low severity | Omit chip or footnote icon | Collapsed footnote |

**Anti-patterns (reject):**

- Coloring entire queue card red for every needs-attention row.
- Showing numeric `priority_score` at L1.
- Mapping P0 to generic CRM `urgencyTier` on all opportunities — **recommendation band wins** when preview present.

**Attention compression (scan lane):**

When `_operational_recommendation_preview` exists:

1. Show recommendation block (L0).
2. Hide or collapse `operationalNextHint` if redundant with `next_label`.
3. Keep `attentionReason` as **short headline** OR demote below recommendation — pick one per design pass (Card 2.3).

---

## 1.3 Recommendation anatomy refinement (compressed clarity)

Map canonical fields → operator phrases (server-side labels already exist; Phase 2 is **presentation**).

| Anatomy slot | Canonical source | L0 max | L1 max | Voice |
|--------------|------------------|--------|--------|-------|
| **Headline** | `title` | — (use shortened title or `next_label`) | 80c | Judgment, not taxonomy |
| **Why now** | `urgency_reason` + first clause of `why_it_matters` | 140c combined in `why_line` | `urgency_reason` line + optional short why | Operational, not “Operational attention:” |
| **Do next** | `recommended_action.label` | 60c `next_label` | 120c `next_action_label` | Verb-first |
| **Likely** | `likely_outcome` | — | 160c `outcome_line` | Conditional, not promise |
| **Risk** | `likely_risk` | — | L2 only | Honest downside |
| **Because** | `action_rationale` | — | L2 only | Links action to signals |
| **Timing** | `communication_reference.timing_hint` | tooltip | L2 text | No send button |
| **Escalate** | `escalation_reference.policy_basis` | chip + clause | subline | Policy-cited |

**Banned primary copy patterns (Phase 2 GATE):**

- “Operational attention: …” as the main why line.
- “Respond to new request” as generic action without catalog context.
- “Alloy suggestion” as the only product label (rename to **“Operational read”** or **“BOS assessment”**).

---

## 1.4 Multi-factor reasoning

| Layer | Content | Visibility |
|-------|---------|------------|
| **Primary** | `primary_reason` via catalog title/why | L0–L1 |
| **Secondary** | `secondary_factors[]` | L2 list (label + optional severity dot) |
| **Signals** | `grounding_signals[]` / `drawer_strip.signal_labels` | L2 capped list (≤6 labels); codes optional in support mode |
| **Escalation overlay** | `recommendation_type === escalation` | L0 chip + L1 policy line |
| **Timing overlay** | `urgency_reason`, wait bucket context from resolver | Woven into “Why now” — not separate essay |
| **SLA overlay** | `sla_tier` on factors / primary | Severity dot or “Past goal” inline — not paragraph |

**Expand contract:**

- Default collapsed: **“Supporting factors (N)”**.
- Never show parallel recommendation cards for multiple reasons (GATE 0 §6.6).

---

## 1.5 Operational sequencing

BOS should answer: **what should happen next operationally.**

| Concept | Implementation (Phase 2) | Not in Phase 2 |
|---------|--------------------------|----------------|
| **Next best action** | Single `recommended_action` at L1 | Auto-execute |
| **After delay** | Copy-only in catalog (`timing_hint`) | Scheduled jobs |
| **Escalation path** | Escalation type + policy basis | Auto-notify manager |
| **Communication timing** | Show `timing_hint` text at L2 | Draft body / send |
| **Alternate actions** | `available_actions[]` labels at L2 | Resolved placements |

**Vocabulary lock (cross-surface):**

| Old | Phase 2 preferred |
|-----|-------------------|
| Next · | **Do next** |
| Why · | **Why now** |
| Alloy suggestion | **Operational read** (preview) |
| Suggested next step | **Do next** (drawer fallback) |

**Queue sequencing:** One block — `{urgency chip?} {action line} {why clause}` — then stop.

---

## 1.6 Trust + confidence UX (deterministic Phase 2)

| Element | Rule |
|---------|------|
| **Grounding** | L2 list from `signal_labels` / factors — human labels only |
| **Confidence** | Show footnote only when `confidence_level === low` (“Timing approximate”) OR always show subtle “Deterministic” badge at L1 — product choice in Card 2.1 |
| **Stale** | When `drawer_strip.is_stale`, show `stale_banner` prominently |
| **Preview boundary** | Visible text: “Preview — open record for full assessment” (not tooltip-only) |
| **Invalidation** | Defer live `validateRecommendationFreshness` to Phase 2 Card 2.6 or Phase 3 — UI slot reserved |
| **No fake confidence** | No percentages, no “BOS is 87% sure” |
| **No anthropomorphism** | No “I think”, “BOS recommends you should” |

**Enhance draft:** Keep visually **below** L1 anatomy, labeled as optional draft tooling — not part of recommendation trust.

---

# STEP 2 — Phase 2 sprint structure (cards + gates)

## 2.1 Card map

| Card | Scope | Primary files (expected) | Out of scope |
|------|-------|--------------------------|--------------|
| **2.1** | Drawer L1 anatomy — title, urgency chip, why now, do next, outcome | `OperationalAttentionHeaderStrip.tsx`, selector VM extensions | New routes, enrich |
| **2.2** | Handoff parity — full render.handoff + drawer vocabulary | `operationalRecommendationHandoff.ts`, Orchestrator seed | Task Assist auto-run |
| **2.3** | Queue L0 — urgency chip, compression, collapse rules, preview boundary copy | `QueueBlock.tsx`, `enrollmentWorkUnitViewModel.ts`, `CrmCompactRowSemanticSlots` types | Queue ordering, new fields |
| **2.4** | L2 expand — factors, signals, rationale, risk, timing (read `getRecommendationDetailSummary`) | New small drawer sub-panel or extend existing panel | `available_actions` placement |
| **2.5** | Escalation + type chips — visual grammar for escalation/communication/operational | Shared chip component + CSS tokens | Resolver changes |
| **2.6** | Stale + trust chrome — banner, deterministic badge, optional freshness hook stub | Strip + tests | DB persistence |
| **2.7** | Selector/view-model enrichment — pass through fields UI needs without React copy | `recommendationSurfaceSelectors.ts` | Builder/catalog changes |
| **2.8** | Regression + GATE 2 demo script + docs update | Tests, sprint §5.4 checklist | AI enrich |

**Optional split:** 2.4 + 2.5 can merge if scope tight.

---

## 2.2 GATE 2 — exit criteria

| # | Criterion |
|---|-----------|
| G2-1 | Needs Attention → queue row shows **urgency-aware** preview (band or chip) + catalog action/why — not legacy boilerplate when canonical present |
| G2-2 | Drawer open shows **title-led** L1 anatomy with **Do next / Why now / Likely** — not only resolver headline |
| G2-3 | Orchestrator handoff seed matches drawer judgment (same primary phrase family) |
| G2-4 | L2 expand shows factors + signals without exposing reason codes by default |
| G2-5 | No “Operational attention:” as primary why in default path |
| G2-6 | Queue preview boundary copy visible — preview-only truth preserved |
| G2-7 | No new apply/send/workflow execution from recommendation UI |
| G2-8 | Phase 2 tests pass; no AI routes added under `recommendations/*` |

**Demo script (minimum):** Reuse parent sprint §5.7 GATE C — update expected copy to reference catalog titles and urgency chips.

---

## 2.3 Explicit non-goals (Phase 2)

| Item | Deferred to |
|------|-------------|
| AI enrich / LLM polish | Phase 4 |
| `validateRecommendationFreshness` live invalidation | Phase 2.6 stub or Phase 3 |
| Telemetry (shown / handoff / stale) | Phase 4 §4.3 |
| Task Assist prefill from `communication_reference` | Phase 3 |
| `available_actions` → placement resolution | Phase 3 |
| Full reason-code catalog sweep | Ongoing catalog work — not blocking GATE 2 |
| Removing `_attention_suggestion` from wire | Phase 3+ |
| Portfolio AI prioritization across records | Future |
| Redesign of non-recommendation drawer layout | Out of scope |

---

## 2.4 Phase 3+ separation (do not blur into Phase 2)

| Track | Focus |
|-------|-------|
| **Phase 3 — Workflow + comms** | `available_actions` intents, Task Assist prefill hints, Workflow Assist cross-links |
| **Phase 4 — Trust + AI** | Enrich with grounding enforcement, telemetry, `deterministic_vs_ai_assisted` badges |
| **Phase 5 — Rollout** | Feature flag, pilot feedback on **catalog** not resolver |

Phase 2 may add **read-only** display of `communication_reference.timing_hint` — not bodies, not sends.

---

## 2.5 Implementation guardrails (carry forward)

From GATE 0 + Phase 1 closeout — unchanged:

- No recommendation copy composed in React components.
- No second builder or catalog fork in UI layer.
- Selectors may gain **fields**, not **sentences**.
- Queue rows remain preview/selection only.
- Entity GET remains authoritative for full judgment.
- Legacy fields remain until explicit deprecation phase.

---

## 2.6 Test strategy (Phase 2)

| Layer | Tests |
|-------|-------|
| Selector VM | Extend `recommendationSurfaceSelectors.test.ts` for new resolved fields (urgency, title, type, detail bundle) |
| Component smoke | Extend `operationalAttentionSuggestionUi.test.tsx` — urgency chip, title-led headline, L2 expand |
| Handoff | Extend `operationalRecommendationHandoff.test.ts` — vocabulary parity |
| Queue VM | Unit test: when canonical preview present, `operationalNextHint` suppressed per rules (if implemented in VM) |
| No snapshot churn | Prefer structural assertions over full HTML snapshots |

---

## 2.7 Documentation updates (on implementation, not in this planning PR)

When Phase 2 cards land:

- Update [`bos_operational_recommendation_intelligence_sprint.md`](./bos_operational_recommendation_intelligence_sprint.md) §5.4 — mark cards done.
- Add §13 Phase 2 closeout to [`bos_operational_recommendation_phase1_execution.md`](./bos_operational_recommendation_phase1_execution.md) or append Phase 2 closeout here.
- Optional: `docs/product/crm-system.md` — one paragraph on recommendation surfaces (queue preview vs drawer authority).

---

# STEP 3 — Implementation status

| Step | Status |
|------|--------|
| Step 0 — UX audit | ✅ Complete (this doc §0) |
| Step 1 — UX framework | ✅ Complete (this doc §1) |
| Step 2 — Sprint structure | ✅ Complete (this doc §2) |
| **Implementation** | ⏸ **Not started** — begin with Card 2.1 after review |

**Next action after review:** Implement **Card 2.1** (drawer L1 anatomy) in a focused PR, then 2.3 (queue L0) for visible scan-lane wins.

---

## Appendix — Phase 1 → Phase 2 field consumption matrix

| Contract field | Projected (Phase 1) | Consumed in UI (Phase 1) | Phase 2 target |
|----------------|---------------------|--------------------------|--------------|
| `title` | drawer_strip, handoff | Handoff only | **L1 headline** |
| `why_it_matters` | queue, drawer_strip, handoff | why lines | **Compressed “Why now”** |
| `urgency` + `urgency_reason` | drawer_strip | **Unused** | **L0 chip + L1 line** |
| `recommended_action.label` | queue, drawer_strip | yes | **“Do next”** |
| `likely_outcome` | drawer_strip | **Unused** | **L1 optional** |
| `likely_risk` | detail | **Unused** | **L2** |
| `action_rationale` | detail | **Unused** | **L2** |
| `secondary_factors` | detail | comma list only | **L2 list** |
| `grounding_signals` / `signal_labels` | drawer_strip (labels) | **Unused** | **L2** |
| `recommendation_type` | queue metadata | **Unused** | **Type chip** |
| `escalation_reference` | DTO only | **Unused** | **L1 escalation** |
| `communication_reference.timing_hint` | DTO only | **Unused** | **L2 text** |
| `is_stale` / `stale_banner` | drawer_strip | **Unused** | **L1 banner** |
| `confidence_level` | drawer_strip | low only | **Footnote rule** |

This matrix is the **backlog for Phase 2 UI work** — no contract changes required for most cards.

---

**Suggested commit message (docs only):**

```
docs(sprint): Phase 2 operational recommendation UX audit and sprint plan.

Document Phase 1 UX gaps, L0–L3 hierarchy, urgency/trust framework, and gated implementation cards before Phase 2 coding.
```
