# BOS Operational Recommendation Intelligence — Phase 2 Operational UX Sprint

**Path:** `docs/sprints/archive/05_2026/completed/bos_operational_recommendation_phase2_operational_ux.md`  
**Status:** Phase 2 **COMPLETE** (GATE 2 passed) — Cards 2.1–2.8 shipped; Card 2.9 optional deferred  
**Date:** 2026-05-21 (Card 2.8 closeout: 2026-05-21)

**Binding inputs:**

| Doc | Role |
|-----|------|
| [`bos_operational_recommendation_intelligence_sprint.md`](../bos_operational_recommendation_intelligence_sprint.md) | Program audit, recommendation framework, phase map |
| [`bos_operational_recommendation_intelligence_gate0.md`](./bos_operational_recommendation_intelligence_gate0.md) | Doctrine — assistive only, no autonomy |
| [`bos_operational_recommendation_phase1_execution.md`](./bos_operational_recommendation_phase1_execution.md) | Phase 1 closeout (§12) — **COMPLETE** |
| [`forms_documents_operational_experience_hardening.md`](../forms_documents_operational_experience_hardening.md) | **Canonical** BOS operational interaction doctrine |
| [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md) | Shared visual restraint + AdminV2 kinship (sibling sprint) |

**Phase:** 2 — Operational cognition presentation (deterministic)  
**Blocks:** Phase 3 workflow/comms wire, Phase 4 AI enrich (unchanged)

**Phase 2 is still deterministic operational intelligence.** No AI enrich, no LLM reasoning, no autonomous behavior, no recommendation generation in UI, no workflow mutation, no persistence, **no runtime or component changes in this alignment pass**.

### Canonical interaction doctrine (binding)

**Authority:** [`forms_documents_operational_experience_hardening.md`](./forms_documents_operational_experience_hardening.md) § Unified BOS Operational Interaction Doctrine.

**Reference interaction model:** `IntakeCaseFileLayout` + `BosReviewSummaryPlaceholder` + `PacketReviewInsightV1` (Forms/Documents). AdminV2 drawer, queue, and handoff must **inherit** that model — not invent a parallel “recommendation product.”

**BOS role (operator-facing):** operational narrator, reviewer assistant, anomaly detector, workflow explainer, operational prioritization layer, operational cognition support.

**BOS anti-role:** chatbot, assistant feed, recommendation spam, giant AI card system, autonomous operator, intelligence dashboard, hidden workflow engine.

**Visual system (sibling):** [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md) — one intelligence band per surface; muted assist styling; shared readiness/urgency grammar with Forms.

---

## Program goal (Phase 2)

Transform Phase 1 wire + projections from **structurally correct** into **operationally legible cognition support**: compressed narration, prioritization cues, restrained urgency, and progressive reasoning — without changing builder logic.

Operators should answer, in order:

1. What is this? (context — mostly **outside** the BOS band)  
2. Is anything wrong? (trust / readiness)  
3. What changed? (anomaly overlay when present)  
4. What should I review? (**suggested focus**)  
5. What should I do next? (**do next** — sequencing, not execution)

…before optional reasoning detail (L2) or handoff/orchestration context (L3).

**Not:** a suggestion feed, stacked recommendation cards, chatbot transcript, or alarm-heavy “AI intelligence” panel.

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

**Phase 2 fix direction:** Reframe strip as **Review assist band** (Forms anatomy): readiness → suggested focus → do next; demote resolver label to L2/support — **do not** let judgment title compete with drawer workflow actions.

---

### 2. Where urgency is unclear

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| P0–P3 not visible in drawer L1 | `drawer_strip.urgency_label` / `urgency_reason` exist but unused in UI | Selector returns fields; component does not render them |
| Queue ignores `urgency_band` | `ResolvedQueueRecommendationPreview.urgencyBand` populated, never passed to VM/CSS | Missing wire from selector → `CrmCompactRowSemanticSlots` |
| Row `urgencyTier` is queue-sort artifact | Card rail uses job/opportunity queue priority, not recommendation band | Two urgency systems can **conflict visually** |
| Escalation type invisible at L0 | `recommendation_type: escalation` only in full DTO / preview metadata | No type chip at queue or drawer L1 |
| SLA breach not distinguished from “needs attention” | `attentionReason` and recommendation why both stress urgency without band hierarchy | No single **urgency chip** grammar |

**Phase 2 fix direction:** One **sequencing chip** per surface (P0–P3) — prioritization cue, not alarm; align with Forms readiness grammar + GATE 0 §6.2 (restrained accent, P3 collapsed).

---

### 3. Where escalation is weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| `sla_breach` catalog is strong; UI does not say “escalation” | `recommendation_type === escalation` + `escalation_reference` on DTO | No escalation-specific L1 treatment |
| Policy basis not shown | `escalation_reference.policy_basis` in contract | Not in any projection consumer |
| Drawer treats escalation like operational follow-up | Same strip layout for all types | No visual or copy distinction for **leadership visibility** |

**Phase 2 fix direction:** When `recommendation_type === escalation`, show **policy basis** as subline under focus (truncated) + discrete **Needs leadership review** chip — not red card wash or alarm semantics.

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

**Phase 2 fix direction:** Use catalog **`title`** as **suggested focus** line; demote resolver reason labels to L2/support — never as the only headline.

---

### 9. Where reasoning hierarchy is weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Flat “Why ·” paragraph | Single block | No visual separation of **matter / urgency / rationale** |
| `action_rationale` never shown at L1 | In `render.detail` only | Operator does not see **why this action** vs **why it matters** |
| `current_state_summary` unused in strip | On DTO, not in selector VM | State vs judgment collapsed |
| Confidence only as “Approximate timing” | When `confidence_level === low` | No positive high-confidence affordance |

**Phase 2 fix direction:** L1 assist band order: **Readiness** → **What changed (if any)** → **Suggested focus (title + why now)** → **Do next** → optional **Likely** — reasoning stays in collapsed L2.

---

### 10. Where recommendation trust is visually weak

| Symptom | Evidence | Root cause |
|---------|----------|------------|
| Stale banner on DTO, rarely seen | `drawer_strip.stale_banner` | `is_stale` always false until live freshness wired |
| No “deterministic” indicator | Phase 1 is deterministic-only on wire | Operators cannot distinguish from future AI polish |
| Grounding signals hidden | `grounding_signals[]` on DTO | No L2 “Based on” list |
| Preview disclaimer only in `title` attr | Tooltip on queue suggestion | Easy to miss — needs **visible preview boundary** copy |
| Enhance draft adjacent to deterministic copy | Same strip | **Trust blur** between deterministic judgment and AI enhance |

**Phase 2 fix direction:** Trust via **readiness + grounded provenance** (stale banner, low-confidence timing caveat, L2 “Based on” signals) — not a permanent “Deterministic” marketing badge; keep enhance draft subordinate and visually separated.

---

## 0.3 Cross-cutting risks (Phase 2 must guard)

| Risk | Mitigation in Phase 2 |
|------|---------------------|
| **Alert fatigue** | Cap P0 visual weight; one accent per row; no red wash |
| **Recommendation repetition** | Collapse duplicate lines (attention headline vs why); one primary narrative per row |
| **Queue truth drift** | No new queue fields for execution; preview tooltips unchanged |
| **UI copy generation** | All strings from server projections + selectors — **no new template logic in React** |
| **AI scope creep** | Explicit card gate: no enrich route changes in Phase 2 |
| **Density overload on scan lane** | Max **one** operational-read line at L0; collapse operational summary when preview present |
| **Cognition inversion** | BOS band must not appear **above** primary drawer workflow actions or read as layer-1 operator action |
| **Surface budget violation** | Strip + panel + queue chip + enhance = multiple personalities — merge to **one story** per entity |

---

# STEP 0.4 — Doctrine alignment audit (Forms/Documents convergence)

**Purpose:** Correct Phase 2 planning drift **before** implementation. No code changes in this pass.

### Drift identified (pre-correction)

| Drift | Where it appeared | Conflict with Forms/BOS doctrine |
|-------|-------------------|--------------------------------|
| **Recommendation-first hierarchy** | §1.1 “title-led” L1, audit §8 | Cognition order requires **trust → focus → action** inside assist band; record context + workflow actions stay primary |
| **L1 visual weight “medium–high”** | §1.1 L1 table | Intelligence band must stay **subordinate** — calm assist tint, not dominant card |
| **Urgency as emergency signaling** | P0 “strongest border accent”, “Act today or escalate now” | Urgency = **operational sequencing guidance**, not alarm UX |
| **“Deterministic assessment” as L1 badge** | §1.6, audit §10 | Trust from **readiness + provenance**, not product marketing labels |
| **“BOS assessment” vocabulary** | §1.3 banned list alternate | Prefer **Operational read** / **Review assist** (Forms-aligned) |
| **L2 as “new sub-panel”** | Card 2.4 | Risks second intelligence region — must be **collapsed disclosure** inside existing drawer anatomy |
| **Queue as mini recommendation card** | L0 block structure | Queue = **prioritization cue** (one merged line), not feed item |
| **Outcome at L1 default** | §1.1 outcome visibility | Outcome is **secondary** — optional one line after do next, not primary narrative |
| **Parallel lines = feed tendency** | Audit §5, §7 | Violates surface budget — collapse to one operational read |
| **Enhance adjacent to assist** | Audit §10 | Blurs deterministic narration vs optional AI draft — separate region/footer |

### Conflicting interaction patterns (resolved in §1)

| Pattern | Reject | Adopt |
|---------|--------|-------|
| Resolver headline `Needs attention: {label}` | Primary judgment line | **Suggested focus** line from catalog `title` |
| “Alloy suggestion” queue chip | Feed framing | **Operational read** (preview) |
| Multiple “next” lines on queue row | Competing sequencing | Single **do next** clause in one read line |
| Drawer strip competes with workflow CTAs | Hidden layer-1 actions | Assist band **below** record orientation; actions unchanged |
| L2 reasoning default-open | Cognitive overload | **Collapsed** “Supporting detail” disclosure |
| Handoff as conversation turn | Chatbot drift | **Awareness seed** — same focus phrase family as drawer |

### Recommendation-feed tendencies (explicitly rejected)

- Stacked recommendation cards on drawer or queue  
- Oversized intelligence panels or gradient “AI” cards  
- Multiple competing BOS regions (strip + full panel duplicate story)  
- Verbose `why_it_matters` as primary wall of text  
- Urgency chips on every row regardless of band (P3 noise)  
- Treating `_operational_recommendation` as a **product surface** instead of **assistive narration**

### Over-emphasis risks (guardrails)

| Risk | Guardrail |
|------|-----------|
| Red saturation on P0 | One accent element per row; no full-card danger styling |
| Always-on “Deterministic” badge | Show only when trust state needs qualification (stale, low timing confidence) |
| Outcome line pushes feed tone | Max one conditional line; omit on L0 |
| Escalation chip screams emergency | Policy-cited subline; muted chip grammar |
| L2 factor list dominates drawer | Max height + collapsed; never pushes review actions below fold |

### AI-feeling language (ban list — Phase 2)

| Avoid | Prefer |
|-------|--------|
| AI suggestion / assistant recommendation | Operational read / Review assist |
| Alloy thinks / BOS recommends you should | Focus: … / Do next: … |
| Recommended by AI | Grounded operational read |
| Intelligence dashboard / insights hub | Review assist band |
| Confidence % / model scores | Readiness state + timing caveat |
| I'm / we suggest (anthropomorphic) | Catalog-backed operational copy |

### Cognition vs presentation levels

**Two orthogonal axes** (do not conflate):

1. **Operational cognition hierarchy** (what matters first) — binding order from Forms doctrine  
2. **Presentation levels L0–L3** (how much detail per surface) — density only  

Presentation levels must **never** reorder cognition layers (e.g. L1 must not show L2 reasoning before suggested focus).

---

# STEP 1 — Phase 2 UX framework (doctrine-aligned)

## 1.1 Operational cognition hierarchy (binding)

Inherited from Forms doctrine. **Applies to every BOS surface** before presentation level rules.

| Order | Layer | Operator question | Phase 2 BOS mapping (contract fields) |
|-------|-------|-------------------|--------------------------------------|
| 1 | **Current operator action** | What can I do here, now? | **Outside** assist band — existing drawer/workflow CTAs, review actions, approve/reject |
| 2 | **Trust / confidence state** | Is this assessment current and reliable? | Readiness chip (`urgency_label` band), `stale_banner`, low-timing caveat |
| 3 | **Changes / anomalies** | What changed vs known state? | `urgency_reason` clause, activity/stale footnotes, escalation policy basis |
| 4 | **Operational context** | Who / what record / what flow? | Entity header, queue subject, status pills — **minimal repeat** in BOS band |
| 5 | **Suggested focus** | What should I review? | Catalog `title` + compressed **Why now** (`why_it_matters` clause) |
| 6 | **Technical detail** | Why does the system think this? | L2 disclosure: factors, `signal_labels`, `action_rationale`, codes (support mode) |

**Within the Review assist band (drawer L1), render order is always:**  
`trust/readiness` → `what changed (if any)` → `suggested focus` → `do next` → optional `likely` → collapsed `supporting detail`.

---

## 1.2 Presentation levels (L0–L3) — density only

Aligned with GATE 0 §6.3 and Phase 1 `render.*` bundle. Phase 2 **implements** existing projections; does not add builder logic.

| Level | Surface | Operator job | Visual restraint | Shown (deterministic) | Hidden by default |
|-------|---------|--------------|------------------|----------------------|-------------------|
| **L0 — Queue preview** | `CrmCompactQueuePreview` | Prioritize scan — open record? | **Low** — one merged operational read line + optional sequencing chip | `{chip?} {do next clause} · {why now clause}` (≤2 visible lines total) | Outcome, factors, signals, rationale, policy detail |
| **L1 — Drawer assist band** | `OperationalAttentionHeaderStrip` | Orient review on open | **Low–medium** — single assist band (Forms `BosReviewSummaryPlaceholder` analog) | Readiness chip, focus line, do next, optional one outcome | Full why essay, factors, signals, enrich draft body |
| **L2 — Supporting detail** | Collapsed `<details>` in drawer | Validate before acting | **Secondary** — never default open | Factors, signals, rationale, risk, timing hint (text) | Reason codes, scores, resolver version |
| **L3 — Handoff seed** | Orchestrator awareness | Continue with same story | **Low** — seed string only | `handoff.primary_recommendation`, compressed `operational_reason`, `cta_label` | Full DTO, reasoning dumps |

**Forms reference mapping:**

| Layer | Forms | AdminV2 Phase 2 |
|-------|-------|-----------------|
| Assist band | `BosReviewSummaryPlaceholder` | `OperationalAttentionHeaderStrip` (reframed) |
| Readiness | `PacketReviewInsightV1.readiness_state` | `urgency` band + stale banner |
| Changes | `WhatChangedPanel` / `key_changes` | `urgency_reason` + activity footnote |
| Focus | `suggested_focus` | Catalog `title` + short why |
| Paths | `review_paths` | **Do next** (`recommended_action.label`) |
| Technical | `PacketReviewTechnicalPanel` | L2 disclosure |

**Surface budget (mandatory):** **One** primary intelligence region per entity view. Queue preview is a **density-reduced projection** of the same story — not a second product surface.

**Density rules:**

- **One operational read** per level — collapse `attentionReason`, priority explanation, summary preview, and recommendation when they repeat.
- **Truncate with intent** — L0 uses shortest catalog tier; drawer may show one extra clause.
- **Progressive disclosure** — L2 collapsed by default; never visually dominant over review actions.

**Do next visibility:**

- L0: embedded in merged read line (`next_label`), not a button.
- L1: labeled **Do next** (verb line), not “Next ·” / “Suggested next step”.
- L2: `available_actions[]` as optional intent labels only — no placement resolution in Phase 2.

**Escalation visibility (restrained):**

- L0: discrete chip + shortened why — not red row.
- L1: policy basis subline under focus; chip **Needs leadership review** when `recommendation_type === escalation`.

**Outcome visibility (secondary):**

- L0: omit — “Open record for full read” boundary copy.
- L1: optional one `outcome_line` **after** do next when catalog provides it.

---

## 1.3 Urgency hierarchy (P0–P3) — sequencing, not alarm

**Doctrine:** Urgency supports **operational sequencing guidance**. It is **not** emergency signaling, alarm UX, or portfolio panic language.

**Source of truth:** `OperationalRecommendationV1.urgency` — builder-owned; Phase 2 does **not** change resolver rules.

| Band | Sequencing meaning | Emphasis rule | L0 | L1 assist band |
|------|-------------------|---------------|-----|----------------|
| **P0 — Urgent** | Address before other scan work today | Single accent; never full-card red | Compact chip; align with existing attention badge — **do not duplicate** | Readiness chip + `urgency_reason` line |
| **P1 — Today** | Default coaching window | Standard | Chip “Today” | Default assist styling |
| **P2 — Soon** | Family/clock wait | Muted | Icon or omit chip | Softer meta typography |
| **P3 — FYI** | Informational | **Quiet** — collapse | Omit chip | Footnote only |

**Anti-patterns (reject):**

- Red saturation / danger styling on every needs-attention row  
- Alarm copy (“Emergency”, “Critical alert”)  
- Numeric `priority_score` at L1  
- Competing `urgencyTier` (queue sort) + recommendation chip without merge rules  

**Scan-lane compression** (when `_operational_recommendation_preview` present):

1. Emit **one** operational read line (Card 2.3).  
2. Suppress redundant `operationalNextHint` / duplicate next lines.  
3. Demote or merge `attentionReason` — never two headlines.  
4. Collapse `_operational_summary_preview` when it repeats the same story.

---

## 1.4 Review assist anatomy (compressed operational narration)

Map canonical fields → operator phrases (server-side labels only; Phase 2 is **presentation**).

| Slot | Cognition layer | Canonical source | L0 | L1 | Voice |
|------|-----------------|------------------|----|----|-------|
| **Readiness** | Trust | `urgency` + `stale_banner` + `confidence_level` | chip only | chip + stale banner | Calm state, not alarm |
| **What changed** | Anomaly | `urgency_reason`, activity footnote | in `why_line` | one line before focus | Factual delta |
| **Suggested focus** | Focus | `title` + `why_it_matters` (clause) | merged in read | focus line ≤80c | Review target, not taxonomy label |
| **Do next** | Sequencing | `recommended_action.label` | in read | labeled row ≤120c | Verb-first |
| **Likely** | Outcome (secondary) | `likely_outcome` | — | optional ≤160c | Conditional |
| **Risk** | L2 | `likely_risk` | — | collapsed | Honest downside |
| **Because** | L2 | `action_rationale` | — | collapsed | Links action to signals |
| **Timing** | L2 | `communication_reference.timing_hint` | — | collapsed text | No send |
| **Escalate** | Anomaly overlay | `escalation_reference.policy_basis` | chip + clause | subline | Policy-cited |

**Vocabulary lock (binding):**

| Use | Do not use |
|-----|------------|
| Operational read (queue preview label) | Alloy suggestion, AI suggestion |
| Review assist (drawer band region) | Recommendation card, intelligence panel |
| Why now | Why · (bare), Operational attention: … |
| Do next | Next ·, Suggested next step |
| Suggested focus | Needs attention: {resolver label} as primary |
| What changed | (implicit in urgency_reason when delta known) |

**Banned primary copy (GATE 2):** “Operational attention: …”; generic CTAs without catalog context; anthropomorphic or AI-marketed framing.

---

## 1.5 Multi-factor reasoning (progressive, secondary)

Reasoning supports focus — it does not replace it.

| Layer | Content | Visibility |
|-------|---------|------------|
| **Primary** | Catalog title + one why clause | L0–L1 focus lines only |
| **Secondary** | `secondary_factors[]` | L2 collapsed list |
| **Signals** | `signal_labels` / `grounding_signals` | L2 “Based on” (≤6 labels) |
| **Escalation overlay** | policy basis | L0 chip + L1 subline |
| **Timing overlay** | `urgency_reason`, wait context | Woven into **Why now** — not second essay |
| **SLA overlay** | factor severity | Inline dot in L2 — not L1 paragraph |

**Expand contract:** Default collapsed **Supporting detail (N)** — optional, contextual, never visually dominant. No parallel recommendation cards (GATE 0 §6.6).

---

## 1.6 Operational sequencing

BOS narrates **what should happen next operationally** — it does not execute.

| Concept | Phase 2 | Not in Phase 2 |
|---------|---------|----------------|
| **Do next** | Single `recommended_action` at L1 | Auto-execute / apply |
| **After delay** | Catalog `timing_hint` at L2 | Scheduled jobs |
| **Escalation path** | Policy basis copy | Auto-notify |
| **Communication timing** | Text at L2 | Draft / send |
| **Alternates** | `available_actions[]` labels at L2 | Placement resolution |

**Queue:** One merged operational read — `{sequencing chip?} Do next: … · Why now: …` — then stop.

---

## 1.7 Trust + confidence UX (deterministic)

Trust derives from **deterministic reasoning, visible grounding, concise provenance, stable hierarchy** — not confidence theater.

| Element | Rule |
|---------|------|
| **Readiness** | Primary trust surface — band chip + stale banner |
| **Grounding** | L2 human `signal_labels` / factors — “Based on …” |
| **Timing confidence** | Footnote only when `confidence_level === low` (“Timing approximate”) |
| **Preview boundary** | Visible: “Preview — open record for full operational read” |
| **Stale** | Prominent `stale_banner` when `is_stale` |
| **Invalidation** | Live freshness → Card 2.6 stub or Phase 3 |
| **Reject** | Percent scores, anthropomorphic copy, always-on “AI/Deterministic” marketing badges |
| **Enhance draft** | Separate optional region below assist band — never mixed into operational read trust |

---

## 1.8 Anti-chatbot + visual restraint doctrine

Inherited from Forms § Intelligence style + § Anti-patterns.

| Reject | Ship |
|--------|------|
| Chatbot / transcript UX | Review assist band |
| Giant AI cards / gradients | Muted assist tint (PX-0 kinship) |
| Recommendation overload | One story per entity |
| Hidden workflow engine | Visible governed actions elsewhere |
| Autonomous tone | Human-owned decisions |

**Orchestrator:** Handoff = awareness seed with same focus family — not an open-ended agent turn.

---

# STEP 2 — Phase 2 sprint structure (cards + gates)

## 2.1 Card map (doctrine-aligned)

| Card | Scope | Primary files (expected) | Out of scope |
|------|-------|--------------------------|--------------|
| **2.1** | Drawer **Review assist band** — cognition order: readiness → focus → do next → optional likely; Forms anatomy parity | `OperationalAttentionHeaderStrip.tsx`, selectors | New routes, enrich, competing intelligence regions |
| **2.2** | Handoff parity — same focus phrase family as drawer; awareness seed only | `operationalRecommendationHandoff.ts`, `activeOperationalContext.ts` | Task Assist auto-run, chatbot persona |
| **2.3** | Queue L0 — **one operational read line**, sequencing chip, collapse duplicates, preview boundary | `QueueBlock.tsx`, `enrollmentWorkUnitViewModel.ts` | Queue ordering, new wire fields, feed layout |
| **2.4** | L2 **collapsed Supporting detail** — factors, signals, rationale (`getRecommendationDetailSummary`) | Extend existing drawer disclosure — **no new dominant panel** | `available_actions` placement |
| **2.5** | Escalation/type chips — restrained grammar (policy-cited, not alarm) | Shared chip tokens (PX-0 kinship) | Resolver changes |
| **2.6** | Trust chrome — stale banner, low-confidence timing caveat, preview boundary; freshness stub optional | Strip + tests | DB persistence, marketing badges |
| **2.7** | Selector VM — pass fields for cognition-ordered render; **no React copy** | `recommendationSurfaceSelectors.ts`, `recommendationSurfaceViewModels.ts` | Builder/catalog changes |
| **2.8** | Regression + GATE 2 demo + docs | Tests, parent §5.4 | AI enrich |
| **2.9** | (Optional) `OperationalProposalCardFrame` insight region — **insight-only**, same vocabulary | Proposal frame consumers | Second BOS personality on drawer |

**Optional split:** 2.4 + 2.5 can merge. Card 2.9 optional — do not block GATE 2.

### 2.1.1 Card 2.7 closeout (selector pass-through)

**Status:** Complete — composite view-models own field flow; components render normalized VMs only.

| Surface | Canonical owner | Normalized fields |
|---------|-----------------|-------------------|
| Queue L0 | `resolveQueueOperationalReadSlot` | `operationalRead`, `typeCue`, `staleCue`, `previewBoundary` |
| Drawer Review Assist | `resolveDrawerReviewAssistViewModel` | `display`, `supportingDetail`, `readinessChrome` |
| Handoff | `getRecommendationHandoff` / `buildOperationalRecommendationHandoffCopy` | `operationalRead`, `whyNow`, `doNext`, `readinessNote` |

Legacy wire fields (`_attention_suggestion*`, `why_line`, `attentionReason`, `operationalNextHint`) remain **compatibility-only** fallbacks when canonical preview is absent.

### 2.1.2 Card 2.8 closeout (regression + GATE 2 + demo)

**Status:** Complete — Phase 2 regression pass, doctrine audit, GATE 2 verification, demo script.

#### Implementation summary (Cards 2.1–2.8)

| Card | Delivered |
|------|-----------|
| 2.1 | `OperationalReviewAssistBand` — Review Assist band in drawer chrome (`OperationalAttentionHeaderStrip`) |
| 2.2 | Handoff copy parity — `operationalRecommendationHandoff.ts`, `activeOperationalContext.ts` |
| 2.3 | Queue L0 — one operational read via `resolveQueueOperationalReadSlot`; duplicate-line suppression in VM |
| 2.4 | Collapsed **Supporting detail** (`<details>` disclosure; signal count in summary) |
| 2.5 | Restrained classification — `recommendationClassificationSemantics.ts` (type cue, escalation chip) |
| 2.6 | Trust/readiness chrome — `recommendationTrustChrome.ts` (Needs refresh, Approximate timing, etc.) |
| 2.7 | Composite VMs — `recommendationSurfaceViewModels.ts`; normalized field names (`operationalRead`, `doNext`, `likelyOutcome`) |
| 2.8 | Regression suite, GATE 2 audit, demo script, doc closeout |

**No new product capability in 2.8.** One regression fix: `QueueBlock` full-layout path still referenced renamed `line` → corrected to `operationalRead`.

#### Surface behavior summary

| Surface | Primary module | Operator sees | Authority |
|---------|----------------|---------------|-----------|
| **Queue L0** | `QueueBlock` → `CrmCompactOperationalReadPreview` | One operational read line; optional type/stale chips; **Preview** boundary | Preview only — entity GET authoritative |
| **Drawer Review Assist** | `OperationalReviewAssistBand` via `OperationalAttentionHeaderStrip` | Operational read → Why now → Do next → Likely outcome; collapsed supporting detail; trust lines | Full recommendation on entity GET |
| **Handoff / Orchestrator** | `buildOperationalRecommendationHandoffCopy`, `OpportunityOperationalCompactStrip` | Same vocabulary family; optional readiness note; no chatbot framing | Seed / awareness only |
| **Legacy fallback** | Strip without canonical recommendation | Resolver-driven guidance; `nextStepGuidance` templates | Compatibility path until wire deprecation |

#### GATE 2 checklist status

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| G2-1 | Drawer uses **Review Assist band**, not recommendation-feed UX | ✅ Pass | `OperationalReviewAssistBand`; tests ban feed framing |
| G2-2 | Queue shows **one L0 operational read**, not stacked suggestion cards | ✅ Pass | `resolveQueueOperationalReadSlot`; duplicate suppression in VM |
| G2-3 | Handoff uses Review Assist vocabulary and cognition order | ✅ Pass | `operationalRecommendationHandoff.test.ts`, compact strip contract |
| G2-4 | Supporting detail **collapsed by default** | ✅ Pass | Native `<details>`; factors/signals in disclosure |
| G2-5 | Urgency is **sequencing guidance**, not alarm UX | ✅ Pass | Muted chips; no red wash; P-band as prioritization |
| G2-6 | Classification cues **restrained and secondary** | ✅ Pass | Max one type cue; escalation = “Needs leadership review” |
| G2-7 | Trust/readiness chrome avoids **confidence theater** | ✅ Pass | Provenance/readiness labels only; no confidence score |
| G2-8 | BOS **subordinate to workflow CTAs** | ✅ Pass | Assist band in chrome; no new apply/send from assist |
| G2-9 | No AI enrich, LLM calls, or autonomous behavior | ✅ Pass | No routes under `recommendations/*`; deterministic only |
| G2-10 | Forms/Documents operational cognition doctrine followed | ✅ Pass | Vocabulary locked: operational read, review assist, do next, why now |

#### Audit findings (Card 2.8)

**Drawer**

- `OperationalReviewAssistBand` — cognition order correct; banned primary copy absent in canonical path.
- `OperationalAttentionHeaderStrip` — single `resolveDrawerReviewAssistViewModel()` call; no React-composed sentences.
- Supporting detail, urgency/type/trust chrome — selector-owned; restrained density.
- Legacy fallback — resolver label may still appear when no canonical recommendation; not primary in canonical path.

**Queue**

- `QueueBlock` / `CrmCompactOperationalReadPreview` — one read line; preview boundary label **Preview**.
- `enrollmentWorkUnitViewModel` — direct slot pass-through from `resolveQueueOperationalReadSlot`.
- Duplicate-line suppression — `operationalNextHint` / parallel why lines suppressed when canonical preview present (VM rules + tests).
- **Fixed in 2.8:** full-layout queue path referenced stale `operationalRead.line` property.

**Handoff / Orchestrator**

- `operationalRecommendationHandoff` — strips “Operational attention:” prefix; mirrors drawer phrase family.
- `activeOperationalContext` — awareness seed only; optional readiness note.
- `OpportunityOperationalCompactStrip` — contract tests enforce no chatbot / AI authority copy.

**Selectors / VMs**

- `recommendationSurfaceViewModels.ts` — composite drawer + queue slot owners.
- `recommendationClassificationSemantics.ts`, `recommendationTrustChrome.ts` — copy centralized; components render only.

**Remaining exposure (known, non-blocking)**

| Item | Risk | Disposition |
|------|------|-------------|
| `OperationalAttentionDrawerPanel.tsx` — “Suggested next step” | Legacy embed path; not primary Review Assist chrome | Document; remove in Phase 3 wire cleanup |
| Legacy `_attention_suggestion.reasoning.summary` may retain “Operational attention:” prefix | Legacy-only path; canonical selectors strip prefix | Phase 3 `_attention_suggestion` deprecation |
| `opportunityLifecyclePresentation.ts` — “Suggested next step” titles | Enrollment lifecycle guidance, not BOS band | Out of Phase 2 scope |
| Queue row may still show `operationalSummaryPreview` alongside operational read when both attached | Layout density | Monitor; merge rules in VM if noisy in pilot |

**BOS dominance / preview risks**

- Assist band is subordinate (muted styling, below workflow header actions).
- Queue **Preview** label preserves preview-only truth.
- No confidence scores or AI marketing badges in Phase 2 surfaces.

#### Test results (Card 2.8)

Focused Phase 2 suite (10 files, 221 tests): **all passed**.

```
tests/admin/drawer/operationalReviewAssistBand.test.tsx
tests/admin/drawer/operationalAttentionSuggestionUi.test.tsx
tests/adminV2/bos/recommendations/recommendationSurfaceViewModels.test.ts
tests/adminV2/bos/recommendations/recommendationSurfaceSelectors.test.ts
tests/adminV2/bos/recommendations/recommendationClassificationSemantics.test.ts
tests/adminV2/bos/recommendations/recommendationTrustChrome.test.ts
tests/adminV2/bos/recommendations/queueOperationalReadPreview.test.tsx
tests/adminV2/operationalRecommendationHandoff.test.ts
tests/adminV2/activeOperationalContext.test.ts
tests/agent/taskAssist/opportunityOperationalCompactStrip.contract.test.ts
```

**TypeScript:** `npx tsc --noEmit` — Phase 2 production paths clean after `QueueBlock` fix. Repo-wide failures remain in unrelated areas (`attachOperationalRecommendation*.test.ts` fixture types, `prefetchWorkUnitOperationalBootstrap.test.ts`, Forms hub types) — not introduced by Phase 2 cards.

#### Known limitations

- Full reason-code catalog sweep still partial (Phase 1 carryover).
- `validateRecommendationFreshness` not live — stale chrome is display-only from builder flags.
- Telemetry deferred to Phase 4.
- Card **2.9** (proposal frame insight region) not implemented — optional, does not block GATE 2.

#### Deferred items (Phase 3+)

| Item | Phase |
|------|-------|
| `_attention_suggestion` wire removal | Phase 3+ |
| `available_actions` → placement resolution | Phase 3 |
| Task Assist prefill from `communication_reference` | Phase 3 |
| AI enrich / LLM polish | Phase 4 |
| Telemetry (shown / handoff / stale) | Phase 4 |
| `OperationalProposalCardFrame` insight region | 2.9 optional |

#### Demo script (GATE 2)

**Prerequisites:** Org with Needs Attention enrollment queue; at least one row with canonical `_operational_recommendation_preview` (e.g. stale new inquiry bucket).

---

**Scenario 1 — Queue scan**

1. Open AdminV2 workspace → Needs Attention (or enrollment focus queue).
2. Scan a row with operational recommendation preview.

**Operator sees:** One operational read line; optional muted type or “Needs refresh” cue; **Preview** boundary label.

**Narrative:** “Queue stays scan-first; full operational read lives in drawer.”

---

**Scenario 2 — Drawer review**

1. Open the same record from the queue.
2. Observe drawer header chrome (Review Assist band).

**Operator sees:** Review Assist band with operational read, Why now, Do next, Likely outcome; supporting detail collapsed (“Supporting detail · Based on N signals”); workflow actions remain primary above/beside assist.

**Narrative:** “BOS supports review, but workflow actions remain primary.”

---

**Scenario 3 — Handoff**

1. From drawer, open Orchestrator / Task Assist handoff (or compact operational strip on opportunity).

**Operator sees:** Handoff mirrors Review Assist vocabulary; no chatbot language; no AI authority claim.

**Narrative:** “BOS carries context forward without acting autonomously.”

---

**Scenario 4 — Trust / readiness**

1. Use a row or record flagged stale or low-confidence timing (builder `is_stale` / timing caveat).
2. Expand supporting detail optionally.

**Operator sees:** “Needs refresh” or “Approximate timing” only when meaningful; supporting detail available on demand; no confidence score.

**Narrative:** “Trust is provenance/readiness, not model certainty.”

---

**Phase 2 completion:** Cards 2.1–2.8 **COMPLETE**. GATE 2 **passed**. Phase 3 may begin.

---

## 2.2 GATE 2 — exit criteria

**Status:** ✅ **PASSED** (Card 2.8 closeout — see §2.1.2)

| # | Criterion | Status |
|---|-----------|--------|
| G2-1 | Queue row shows **one operational read** + optional sequencing chip — not legacy feed framing when canonical present | ✅ |
| G2-2 | Drawer **Review assist band** follows cognition order (readiness → focus → do next) — resolver label not primary | ✅ |
| G2-3 | Handoff seed matches drawer **suggested focus** phrase family — no chatbot persona | ✅ |
| G2-4 | L2 **Supporting detail** collapsed by default; factors/signals without reason codes in default path | ✅ |
| G2-5 | No “Operational attention:” / “Alloy suggestion” as primary framing | ✅ |
| G2-6 | Queue preview boundary copy visible — preview-only truth preserved | ✅ |
| G2-7 | No new apply/send/workflow execution from assist UI; workflow CTAs remain primary actions | ✅ |
| G2-8 | Urgency reads as **sequencing**, not alarm (no red wash) | ✅ |
| G2-9 | Phase 2 tests pass; no AI routes under `recommendations/*` | ✅ |
| G2-10 | **Doctrine parity** with Forms assist band — same vocabulary (operational read, review assist, suggested focus, do next) | ✅ |

**Demo script:** §2.1.2 (four scenarios: queue scan, drawer review, handoff, trust/readiness). Parent sprint §5.7 GATE C remains valid for end-to-end enrollment persona; update expected copy to catalog titles and Phase 2 vocabulary.

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

- Update [`bos_operational_recommendation_intelligence_sprint.md`](../bos_operational_recommendation_intelligence_sprint.md) §5.4 — mark cards done.
- Add §13 Phase 2 closeout to [`bos_operational_recommendation_phase1_execution.md`](./bos_operational_recommendation_phase1_execution.md) or append Phase 2 closeout here.
- Optional: `docs/product/crm-system.md` — one paragraph on recommendation surfaces (queue preview vs drawer authority).

---

# STEP 3 — Implementation status

| Step | Status |
|------|--------|
| Step 0 — Phase 1 UX audit | ✅ Complete (§0) |
| Step 0.4 — Doctrine alignment audit | ✅ Complete (§0.4) |
| Step 1 — UX framework (cognition + L0–L3) | ✅ Complete (§1) |
| Step 2 — Sprint structure | ✅ Complete (§2) |
| **Implementation (Cards 2.1–2.8)** | ✅ **Complete** — GATE 2 passed (§2.1.2) |
| Card 2.9 (optional proposal frame) | ⏸ Deferred |

**Next action:** Phase 3 — workflow + comms integration (Card 3.1+). See parent sprint §5.5.

---

# STEP 4 — Doctrine alignment changelog (this pass)

### What changed

- Subordinated **L0–L3** to **operational cognition hierarchy** (Forms binding).  
- Reframed drawer work as **Review assist band** (`BosReviewSummaryPlaceholder` analog), not “title-led recommendation strip.”  
- Reframed queue work as **one operational read line**, not a mini recommendation card.  
- Reframed urgency as **sequencing guidance** with visual restraint — removed alarm/emergency framing.  
- Reframed trust as **readiness + provenance** — removed default “Deterministic assessment” marketing badge.  
- Locked vocabulary to **Operational read / Review assist / Suggested focus / Do next / Why now / What changed**.  
- Mandated L2 as **collapsed Supporting detail** — not a new dominant sub-panel.  
- Added GATE 2 criteria G2-8 (sequencing not alarm) and G2-10 (Forms doctrine parity).  
- Added explicit anti-chatbot, surface-budget, and recommendation-feed rejection lists.

### What was corrected (drift removed)

| Removed / refined | Replaced with |
|-------------------|---------------|
| L1 “medium–high” visual weight | Low–medium assist band; subordinate to workflow actions |
| P0 “strongest border accent” / emergency tone | Single accent; policy-cited escalation |
| Title as drawer **primary headline** competing with actions | **Suggested focus** inside assist band after readiness |
| “BOS assessment” as preferred label | **Operational read** / **Review assist** |
| Always-on deterministic badge | Trust footnotes only when state requires |
| L2 “new sub-panel” wording | Collapsed disclosure in existing drawer |
| Queue multi-line recommendation block | One merged operational read |

### What was intentionally preserved

- Phase 1 contract, builder, projections, selectors — **no contract changes** required for alignment.  
- Deterministic-only Phase 2 scope — no AI enrich.  
- Queue preview authority boundary and legacy wire fields.  
- Operational intelligence goals: prioritization, compression, explainability, sequencing.  
- Card numbering 2.1–2.8 core path; 2.9 optional proposal frame.

### References added

- [`forms_documents_operational_experience_hardening.md`](./forms_documents_operational_experience_hardening.md) § Unified BOS Operational Interaction Doctrine  
- [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md) § BOS surfaces + PX-0 kinship  

---

## Appendix — Phase 1 → Phase 2 field consumption matrix

| Contract field | Projected (Phase 1) | Consumed in UI (Phase 1) | Phase 2 target |
|----------------|---------------------|--------------------------|--------------|
| `title` | drawer_strip, handoff | Handoff only | **L1 suggested focus** |
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
docs(sprint): align BOS Phase 2 UX to Forms operational cognition doctrine.

Audit drift, subordinate L0–L3 to cognition hierarchy, reframe assist band and queue read, and tighten vocabulary before implementation.
```
