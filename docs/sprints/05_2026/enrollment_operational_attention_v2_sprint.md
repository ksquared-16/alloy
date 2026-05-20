# Sprint — Enrollment operational attention V2 (prioritization layer)

**Path:** `docs/sprints/05_2026/enrollment_operational_attention_v2_sprint.md`  
**Period:** May 2026  
**Status:** **GATE 3 foundation approved** — proceed with **Phase 1 (explainability UX)** next; no leap to AI / mass automation / event materialization without staged rollout.

**GATE 2 design (full package):** [`enrollment_operational_attention_v2_gate2_design.md`](./enrollment_operational_attention_v2_gate2_design.md)

---

## Purpose

Ship an **operational prioritization layer for enrollment**, not a “warning badge” system. This sprint document sequences **design (GATE 2)** and **foundation (GATE 3)** and **post–GATE 3** delivery.

**Related as-built context:**

- Canonical evaluator: `web/lib/opportunities/opportunityAttentionResolver.ts` (**resolver v2**).
- Count / cohort / histogram semantics: `docs/system/workspace-system.md` § Needs attention count semantics.
- Settings vs runtime parity: `docs/system/configuration-system.md`.
- AI agent boundaries: `docs/product/bos-foundation.md`.
- **Canonical enrollment execution vs overlay (pipeline pills + default lenses):** [`canonical_enrollment_operating_model_seed.md`](./canonical_enrollment_operating_model_seed.md).

---

## Approval gates (process)

| Gate | Status |
|------|--------|
| **GATE 1** | ✅ Approved |
| **GATE 2** | ✅ Approved |
| **GATE 3** | ✅ **Approved** — foundation implementation direction confirmed (resolver-first, deterministic, queue-truth preserved). |
| **Post–GATE 3** | In progress — staged by phase below. |
| **Phase 1 — P1-A** | UX audit & surface mapping — [`enrollment_attention_phase1_gate_p1a_ux_audit.md`](./enrollment_attention_phase1_gate_p1a_ux_audit.md) (**complete**) |
| **Phase 1 — P1-B** | Explainability UX design — [`enrollment_attention_phase1_gate_p1b_explainability_design.md`](./enrollment_attention_phase1_gate_p1b_explainability_design.md) (**design package complete — await approval before P1-C**) |
| **Phase 1 — P1-C** | Implementation — [`enrollment_attention_phase1_gate_p1c_implementation_notes.md`](./enrollment_attention_phase1_gate_p1c_implementation_notes.md) · **Human UX review package** — [`enrollment_attention_phase1_gate_p1c_ux_review_package.md`](./enrollment_attention_phase1_gate_p1c_ux_review_package.md) · screenshots [`assets/p1c-review/`](./assets/p1c-review/) |

---

## GATE 3 review — approved foundation decisions

| Decision | Notes |
|----------|--------|
| **Multi-reason payloads** | Keep **`reasons[]`**, deterministic **`primary_reason`**, additive APIs. **Do not regress** to primary-only semantics in resolver payloads. |
| **Waiting-state model** | **`metadata.enrollment_operational`** is the right lightweight bridge; indexing deferred until profiling proves need. |
| **Priority scoring** | Value is in **`priority_breakdown`** and inspectable dimensions — avoid opaque magic scores. |
| **Event readiness** | Stub/diff path now; materialization and heavy event architecture later. |

---

## Required follow-up adjustments (from GATE 3 review)

### A. Histogram semantics (product + engineering)

- Multi-reason histograms **change the meaning** of the data vs primary-only rollups.
- **Requirement:** Label in UI/tooltips/copy that totals are **reason-level** unless using primary-only aggregation; **never imply** bin sums equal unique inquiries without qualification.
- **Engineering:** `summarizeAttentionReasonCountsPrimaryOnly` documents primary-only call sites; multi-reason default remains for operational breadth.
- **Docs:** `docs/system/workspace-system.md` § Needs attention count semantics expanded accordingly.

### B. Invalid PATCH behavior

- Silent ignore was **acceptable temporarily** for transition safety.
- **Now:** server **warns** when a non-empty `enrollment_operational` body is dropped after validation (`PATCH …/opportunities/:id`).
- **Phase toward:** optional strict validation / HTTP 400 — do not standardize silent operational-state failure long-term.

### C. SLA clock confidence UX

- **`sla_clock_confidence`** must **not** stay hidden forever — eventual surfaces: explainability, debug/admin tooling, trust copy (“derived from explicit wait time” vs “fallback clock”).
- Supports operator trust and future AI advisory boundaries.

### D. `updated_at` dependency (architectural watch)

- Biggest remaining conflation risk: operational vs lifecycle vs system/metadata churn.
- **Future (do not rush):** canonical timestamps such as `last_meaningful_contact_at`, `last_staff_action_at`, `last_family_response_at`, `last_operational_transition_at`.
- Acknowledged in execution parity doc as foundation roadmap.

---

## Strategic positioning

Alloy is evolving toward **operational semantics** — explainable prioritization and machine-readable organizational state — **without** abandoning **deterministic resolver truth**. AI and automation remain **advisory / layered**, not sources of membership.

---

## Recommended post–GATE 3 priority order

### Phase 1 — Explainability UX (highest leverage next)

- Drawer explainability panel  
- Multi-reason chips  
- Score breakdown visibility  
- Waiting-state visibility  
- SLA / breach visibility  
- **Confidence visibility** (`sla_clock_confidence`)  
- Deterministic “what should happen next” hints  

### Phase 2 — Queue readability

- Progressive disclosure, row compression, visual hierarchy, actionable-first ordering  

### Phase 3 — Event enablement

- `attention_entered` / `attention_cleared` / escalation / SLA breached — **behind feature flags** initially  

### Phase 4 — Operational analytics

- Aging, bottlenecks, wait-state reporting, team responsiveness, conversion risk  

### Phase 5 — AI overlays (advisory only)

- Recommendations, risk hints, suggested actions, anomalies — **non-authoritative**  

**Explicit non-goals for the immediate next step:** jumping straight to AI, heavy automation, massive queue redesign, or full event materialization.

---

## Integration alignment — Alloy OS grammar (P1-C refinement)

Operational attention is a **filtered operational lens** wired into existing workspace surfaces, not a parallel “attention cards” product.

| Surface | Role |
|---------|------|
| **`/adminV2/workspace/dept/:departmentId`** | **Command center / prioritization** — Needs Attention lane lists **configured buckets** (platform default rollout: **one** enabled type — Follow-up overdue; more via Settings/metadata). **Scoped counts** align with the **`needs_attention`** work-unit queue when that unit exists (`bucket_count_scope: work_unit_needs_attention_list_cap`). Tiles reuse **compact work-unit queue card** styling. |
| **`…/dept/:id/work-unit/:workUnitId`** | **Execution queue** — same CRM compact rows; Needs Attention supports **`attention_bucket`** + chips for configured types (**`queue=needs_attention`**). Resolver enrichment applies to **all** opportunity queues so attention styling can appear outside the Needs Attention tab. Drawer shows a **compact header** attention strip (no large Overview card). |
| **Settings → Attention & SLA Rules** | Department UI for **`needs_attention_buckets`** plus **explainable criteria** (canonical reason reference) and **editable thresholds** already supported in metadata (`thresholdsHours`, stale days, `sla_wait_hours`, priority weights, reason enablement). Work-unit metadata overrides remain runtime-only until a later pass. |
| **Opportunity drawer** | **Explainability** — Operational attention renders **below** the inquiry/status header stack and **above** overview sections. Resolver snapshot **`_operational_attention`** on entity GET. |

**Configurable buckets (metadata precedence):** `metadata.opportunity_attention_rules.needs_attention_buckets` — **work unit → department → platform defaults** (`web/lib/opportunities/needsAttentionBuckets.ts`).

### Pre-commit hardening — bucket counts + config model

- **Trust:** Department bucket totals no longer use the **500-row org preview** when a **`needs_attention`** work unit exists — `buildWorkUnitScopedNeedsAttentionLaneBuckets` + `GET …/opportunity-attention-preview?work_unit_id=…` match **`loadOpportunityNeedsAttentionRows`** / work-unit tab caps (**5000** candidate window; expose saturation via **`opportunity_needs_attention_semantics`**).
- **Bucket catalog:** UI is config-driven; **`DEFAULT_NEEDS_ATTENTION_BUCKETS`** holds illustrative defaults (reason-code maps only; no rule expressions).

---

## Product / operational philosophy (GATE 1 — locked)

**What “attention” means**

An operationally meaningful **exception, risk, opportunity, or next-action condition** requiring awareness or action.

**It is not:** only stale detection; pure SLA tracking; a task system; a pipeline stage; or a replacement for queues.

**It is:** an operational overlay; prioritization; execution guidance; risk + opportunity surfacing; foundation for future **AI operational guidance** (overlay on deterministic truth, not source of truth).

**Attention ≠ tasks**

Attention stays **derived operational intelligence**. Tasks/reminders may **influence** attention later; they must not become the core model.

---

## Priority tiers (V2)

### Tier 1 — highest

1. Explainability  
2. Operational clarity  
3. Semantic consistency  
4. Stable canonical reasoning  
5. Waiting semantics  
6. Multi-reason visibility  

### Tier 2

7. Severity / prioritization model  
8. SLA semantics  
9. Config governance  
10. Event readiness  

### Tier 3

11. AI readiness  
12. Materialization / event-driven scaling  

---

## Directional decisions (GATE 1 — locked)

| Topic | Decision |
|-------|----------|
| **Org-wide vs work-unit** | Both intentionally; every surface declares cohort semantics; never imply comparability when cohorts differ. |
| **Multi-reason** | **Yes.** Deterministic **`primary_reason`** + full **`reasons[]`**. |
| **Waiting semantics** | Explicit wait buckets; distinct SLA behavior from generic stale. |
| **`activity_stale`** | Evolve toward meaningful activity classes — not raw row-touch as membership. |
| **Config governance** | Validated, inspectable config — no arbitrary rules engine. |
| **Attention change events** | Yes eventually; readiness first. |
| **Demo branching in resolver** | Removed from canonical path. |

---

## GATE 2 — design package (D1–D9)

**Delivered:** [`enrollment_operational_attention_v2_gate2_design.md`](./enrollment_operational_attention_v2_gate2_design.md)

---

## GATE 3 — foundation (completed)

Delivered in codebase: resolver v2, `enrollment_operational` metadata, SLA tiers + confidence, priority score + breakdown, multi-reason histogram default, diff/event stub, docs updates, PATCH validation warnings for ignored operational payloads.

### Department operating console (config-driven lanes)

- **`/adminV2/workspace/dept/:id` — left:** Pipeline **execution** rows mirror **`queue_definition.ui.sections.pipeline.queue_keys`** (labels/icons from **`queues[]`**, optional **`icon`** token). Still one queue-definition engine; **`summary_mode=all`** drives per-lane totals.
- **Right:** **Needs attention** buckets sort by **`priority`** (fallback **`order`**); **no** enrollment lenses ship as global platform defaults — childcare demo buckets are **department-seeded** (`enrollmentNeedsAttentionBucketsSeed.ts` via **`ensureEnrollmentPipelineWorkUnitV1.ts`**). **`waiting_on_*`**, **missing quote**, etc. stay valid **reason codes**; tiles require **`needs_attention_buckets`** config.
- **Icons:** Registry-only Lucide mapping (`WorkspaceOperIcon`) — no React switches on queue/bucket keys.

---

## Success metrics (sprint-level)

- Operators can answer **why** a record appears without filing a bug or reading source code.
- No surface implies **one universal attention count** when cohorts differ; histogram semantics are **labeled honestly**.
- **`primary_reason`** remains stable; **`reasons[]`** remains complete for explainability.
- Architecture remains **resolver-first**, **deterministic**, **auditable**; AI explicitly secondary.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Histogram misread as unique inquiries | Copy/tooltips + primary-only aggregation option |
| Silent PATCH failures | Logging now; strict mode later |
| `updated_at` as SLA proxy | Document confidence; plan canonical timestamps |
| Config explosion | Platform-owned semantics; tune knobs only |

---

## Document maintenance

Update when phases complete, when strict PATCH validation ships, or when canonical activity timestamps land.
