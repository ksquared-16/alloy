# BOS Operational Intelligence — Phase 3 Workflow + Communications

**Path:** `docs/sprints/06_2026/bos_operational_intelligence_phase3_workflow_comms.md`  
**Status:** Planning — **deterministic-first**; no autonomous execution  
**Date:** 2026-05-26

**Program parent:** [`../05_2026/bos_operational_recommendation_intelligence_sprint.md`](../05_2026/bos_operational_recommendation_intelligence_sprint.md)  
**Phase 1 closeout:** [`../05_2026/completed/bos_operational_recommendation_phase1_execution.md`](../05_2026/completed/bos_operational_recommendation_phase1_execution.md)  
**Phase 2 closeout:** [`../05_2026/completed/bos_operational_recommendation_phase2_operational_ux.md`](../05_2026/completed/bos_operational_recommendation_phase2_operational_ux.md)  
**Interaction doctrine:** [`../05_2026/forms_documents_operational_experience_hardening.md`](../05_2026/forms_documents_operational_experience_hardening.md) § Unified BOS Operational Interaction Doctrine

**Phase:** 3 — Workflow-native operational intelligence  
**Blocks:** Phase 4 bounded AI enrich (unchanged)

---

## Program goal (Phase 3)

Extend Phase 1–2 **deterministic operational cognition** into **workflow-native action sequencing** without introducing autonomous execution or broad AI enrich.

Operators should move from **Review Assist** (what to review, why now, do next) to **governed, human-reviewed actions** — Task Assist drafts, workflow explanations, timing guidance, and proposal envelopes — while deterministic recommendation logic remains authoritative.

**Phase 3 is still deterministic-first.** AI may scaffold copy from grounded facts only where explicitly scoped in a later card; no LLM enrich program until Phase 4.

---

## Binding doctrine

AI (when used in narrow scaffolding cards) plugs into the **existing operational cognition layer** — it does not replace it.

| AI may | AI may NOT |
|--------|------------|
| Refine wording from grounded facts | Become source of truth |
| Summarize deterministic signals | Silently mutate records |
| Suggest review focus (display-only) | Bypass workflows or permissions |
| Draft operator-reviewed communications | Invent facts |
| Explain deterministic signals | Create hidden reasoning |
| Prepare governed proposals | Auto-send or auto-apply config |
| Enrich operational context (read-only) | Replace deterministic recommendation logic |

**Human authority:** Every mutating path requires operator review through existing workflow/action surfaces.

---

## STEP 0 — Audit (current state after Phase 2)

### 0.1 Shipped foundation (Phase 1–2)

| Layer | Status | Module / surface |
|-------|--------|------------------|
| Contract | ✅ | `OperationalRecommendationV1`, builder, catalog, fingerprints |
| Entity attach | ✅ | `_operational_recommendation` on opportunity GET |
| Queue preview | ✅ | One L0 operational read; preview boundary |
| Drawer Review Assist | ✅ | `OperationalReviewAssistBand`, collapsed supporting detail |
| Handoff | ✅ | `operationalRecommendationHandoff`, `activeOperationalContext` |
| Selectors / VMs | ✅ | `recommendationSurfaceViewModels`, classification + trust chrome |
| Legacy wire | ⚠️ Parallel | `_attention_suggestion*` still attached; deprecation deferred |

### 0.2 Gaps Phase 3 must close

| Gap | Evidence | Phase 3 target |
|-----|----------|----------------|
| `available_actions` not mapped to placements | Catalog fields exist; no placement resolution UI | Read-only mapping → Task Assist / workflow intents |
| Task Assist prefill absent | `communication_reference` on DTO unused | Deterministic prefill hints from recommendation context |
| Communication draft scaffolding weak | `suggestedContentTemplates` partial | Situational variants from catalog (tour stall, quote pending) |
| Workflow blockage unexplained | Workflow Assist separate from recommendation | Read-only cross-links when `recommendation_type` is workflow-class |
| Freshness not live | `validateRecommendationFreshness` stub | Server-side invalidation path on entity GET refresh |
| Proposal handoff incomplete | Governed envelopes exist; recommendation → proposal seed partial | Explicit handoff to `OperationalProposalCardFrame` envelopes |
| `_attention_suggestion` wire duplication | Legacy + canonical parallel | Deprecation plan + read-order cleanup (no big-bang) |

### 0.3 Integration surfaces (do not bypass)

| Surface | Role in Phase 3 |
|---------|-----------------|
| Task Assist | Operator-reviewed comms draft + approve-to-send |
| Workflow Assist | Read-only explain / cross-link |
| Admin action registry | Placement resolution for `available_actions` |
| `OperationalProposalCardFrame` | Governed proposal envelopes |
| Entity GET / queue enrich | Authoritative recommendation attach |
| Events / workflows | Side effects only through registered paths |

---

## STEP 1 — Design framework

### 1.1 Cognition → action ladder

```
L0  Queue scan        — operational read (preview)
L1  Drawer Review Assist — read, why now, do next, likely outcome
L2  Supporting detail — collapsed factors/signals
L3  Handoff / Orchestrator — awareness seed
L4  Action sequencing (Phase 3) — governed intents, prefill, timing guidance
L5  Human review + apply — Task Assist / workflow / admin actions
```

Phase 3 adds **L4** only. L5 remains unchanged — no auto-apply.

### 1.2 Deterministic-first action sequencing

1. **Catalog owns** action labels, rationale, timing hints, template keys.
2. **Builder owns** which `available_actions` attach to a recommendation.
3. **Selectors own** resolved placement hints and prefill field bundles (no React sentences).
4. **Assist surfaces own** presentation; **execution surfaces own** mutations.

### 1.3 Communication timing guidance

Display-only use of `communication_reference.timing_hint` and related catalog fields:

- Shown in Review Assist supporting detail or Task Assist prefill panel
- Never schedules sends
- Never implies message was sent

### 1.4 Stale / freshness validation

| State | Operator experience |
|-------|---------------------|
| Fresh | Normal Review Assist |
| Stale | “Needs refresh” chrome (Phase 2); Phase 3 adds **invalidation on GET** when fingerprint mismatches |
| Absent | Legacy fallback or no assist band |

No persistence of recommendation history in Phase 3.

---

## STEP 2 — Cards + gates

| Card | Work | Primary modules | Non-goals |
|------|------|-----------------|-----------|
| **3.1** | Map `available_actions` → registered placements / Task Assist intents (read catalog) | `operationalRecommendationCatalog`, placement resolver read path | New apply endpoints |
| **3.2** | Task Assist prefill from `communication_reference` + recommendation context | Task Assist propose path, `operationalRecommendationHandoff` | Auto-send |
| **3.3** | Deepen `suggestedContentTemplates` — situational deterministic variants | Catalog templates | LLM body generation |
| **3.4** | Workflow-class recommendations → Workflow Assist read-only cross-link | Workflow Assist read V1, drawer assist band | Workflow mutation |
| **3.5** | `validateRecommendationFreshness` live on entity GET | Builder attach path, strip/queue stale chrome | DB persistence |
| **3.6** | Handoff to governed proposal envelopes (seed only) | `OperationalProposalCardFrame`, BOS registry | Auto-apply proposals |
| **3.7** | Legacy wire deprecation plan + read-order cleanup | Attach adapters, tests | Remove `_attention_suggestion` in one PR |
| **3.8** | Regression + GATE 3 demo + docs | Tests, parent sprint §5.5 | Phase 4 AI enrich |

**Optional split:** 3.2 + 3.3 can merge. Card 3.7 may span two PRs.

### GATE 3 — exit criteria

| # | Criterion |
|---|-----------|
| G3-1 | `available_actions` resolve to known placements or Task Assist intents — no orphan catalog keys |
| G3-2 | Task Assist launch from recommendation shows **deterministic prefill** — apply still requires recipient + approval |
| G3-3 | Communication timing hints display-only — no send side effects |
| G3-4 | Workflow-class recommendations cross-link Workflow Assist — read-only |
| G3-5 | Stale recommendations invalidate on entity GET refresh when fingerprint mismatches |
| G3-6 | Proposal envelope handoff seeds from recommendation — apply remains governed |
| G3-7 | No new autonomous execution paths; workflow CTAs remain primary |
| G3-8 | Phase 3 tests pass; no Phase 4 enrich routes introduced |
| G3-9 | Forms/Documents cognition doctrine preserved (Review Assist vocabulary) |
| G3-10 | Legacy wire read-order documented; deprecation path clear |

---

## STEP 3 — Integration points

| System | Integration |
|--------|-------------|
| **CRM / attention resolver** | Unchanged rules; builder consumes resolver output |
| **Task Assist V1.1** | Prefill bundle from recommendation subset |
| **Workflow Assist** | Explain link when workflow blockage reason present |
| **Admin actions** | `resolveActionsForContext` alignment for `available_actions` |
| **Communications** | Canonical send path only on operator apply |
| **BOS proposal registry** | Envelope seed from operational context |
| **Orchestrator** | Handoff seed extended with action intent list (read-only) |

---

## STEP 4 — Acceptance criteria

- Operator can open Needs Attention row → drawer Review Assist → launch Task Assist with **catalog-backed prefill** visible before edit.
- Changing record state in another tab → refresh → stale recommendation invalidated (G3-5).
- Workflow recommendation shows **Explain in Workflow Assist** link — no graph mutation.
- All new copy flows through catalog/selectors — not React components.
- Queue remains preview-only; entity GET authoritative.

---

## STEP 5 — Non-goals (Phase 3)

| Item | Deferred to |
|------|-------------|
| Bounded AI enrich (LLM refinement) | Phase 4 |
| Telemetry (shown / handoff / stale) | Phase 4 |
| Recommendation DB / history | Future |
| Autonomous send / schedule | — |
| Portfolio AI prioritization | Future |
| Full reason-code catalog sweep | Ongoing |
| Removing all legacy wire in one release | Phase 3.7 staged plan |

---

## STEP 6 — Test plan

| Layer | Tests |
|-------|-------|
| Catalog / builder | `available_actions` placement keys; template variant coverage |
| Attach / freshness | Fingerprint mismatch → stale/absent on GET |
| Task Assist prefill | Contract test: recommendation subset → propose payload hints |
| Handoff | Extended seed includes action intents; no banned copy |
| Workflow cross-link | Workflow-class type → Assist link present |
| Regression | Phase 1–2 suite still passes |
| GATE 3 contract | Ban auto-send paths; assert human-review gates |

**Commands (baseline):**

```bash
cd web && npm run test -- tests/adminV2/bos/recommendations/
cd web && npm run test -- tests/adminV2/operationalRecommendationHandoff.test.ts
cd web && npx tsc --noEmit
```

---

## STEP 7 — Demo script (minimum)

1. **Action sequencing** — Open stale inquiry → drawer do-next → Task Assist shows prefill from recommendation; operator must confirm recipient before send.
2. **Timing guidance** — Record with timing hint → hint visible in assist/supporting detail; no scheduled send created.
3. **Workflow explain** — Workflow-class recommendation → Workflow Assist link opens read-only explain.
4. **Stale invalidation** — Change status in second tab → refresh drawer → recommendation stale/absent.

---

**Suggested commit message (when implementing):**

```
feat(bos): Phase 3 workflow-native operational intelligence (Card 3.x)

Wire available_actions placements, Task Assist prefill, freshness validation,
and governed proposal handoff — deterministic-first, human-reviewed apply only.
```
