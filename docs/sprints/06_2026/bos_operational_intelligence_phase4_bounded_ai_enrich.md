# BOS Operational Intelligence — Phase 4 Bounded AI Enrich

**Path:** `docs/sprints/06_2026/bos_operational_intelligence_phase4_bounded_ai_enrich.md`  
**Status:** Planning — **GATE 0 + GATE 2 + GATE 3 required before implementation**  
**Date:** 2026-05-26

**Program parent:** [`../05_2026/bos_operational_recommendation_intelligence_sprint.md`](../05_2026/bos_operational_recommendation_intelligence_sprint.md)  
**Phase 3 pack:** [`./bos_operational_intelligence_phase3_workflow_comms.md`](./bos_operational_intelligence_phase3_workflow_comms.md)  
**GATE 0 doctrine:** [`../05_2026/completed/bos_operational_recommendation_intelligence_gate0.md`](../05_2026/completed/bos_operational_recommendation_intelligence_gate0.md)

**Phase:** 4 — Bounded AI enrich (V1.5 behind gate)  
**Prerequisite:** Phase 3 workflow + comms integration complete

---

## Program goal (Phase 4)

Add **bounded AI refinement** on top of deterministic operational recommendations — improving wording, tone, and explainability **only from grounded inputs** — while preserving deterministic fallback, provenance visibility, and human review before any action.

**AI enriches presentation; it does not enrich authority.**

---

## Binding doctrine (non-negotiable)

| Requirement | Rule |
|-------------|------|
| Grounded inputs only | Every AI call receives `OperationalRecommendationV1` subset + `grounding_signals[]` — no free-text record dumps |
| Structured outputs only | JSON schema / validator — no prose blobs without field mapping |
| No raw chain-of-thought | Operator sees refined fields + provenance — not model reasoning traces |
| Validator enforcement | Failed validation → omit AI field; show deterministic copy |
| Provenance visibility | `deterministic_vs_ai_assisted` badge / footnote when AI touched a field |
| Fallback to deterministic | Stale, policy denied, or validation failure → Phase 1–2 copy unchanged |
| No autonomous mutation | Enrich routes are read-only; apply/send unchanged |
| Human review before action | Task Assist / workflow apply gates unchanged |

---

## STEP 0 — Audit (pre-Phase 4)

### 0.1 What Phase 1–3 must provide before AI

| Prerequisite | Why |
|--------------|-----|
| Stable `OperationalRecommendationV1` contract | AI input schema |
| `grounding_signals[]` with validators | Hallucination prevention |
| Fingerprints + stale semantics | Stale-state protection |
| Review Assist VMs | AI output merge target |
| Task Assist prefill path (Phase 3) | Comms draft enrichment surface |
| Telemetry hooks (optional stretch) | Observe enrich success/fallback rates |

### 0.2 Existing enrich infrastructure (reuse, do not fork)

| Module | Role |
|--------|------|
| `OperationalAttentionEnhanceDraft` | Pre-existing drawer draft enhance — align to Phase 4 contract |
| Needs-attention enrich routes | Legacy; migrate to recommendation-grounded path |
| BOS proposal explain | Governed envelope refinement |

---

## STEP 1 — AI input contract

### 1.1 Allowed input fields

```typescript
// Conceptual — implement as shared Zod/TS type in web/lib/adminV2/bos/recommendations/
type OperationalRecommendationEnrichInputV1 = {
  recommendation_id: string;
  fingerprint: string;
  recommendation_type: string;
  title: string;
  why_it_matters: string;
  recommended_action: { label: string; intent_key: string };
  likely_outcome?: string;
  urgency: { band: string; label: string; reason?: string };
  grounding_signals: GroundingSignalV1[]; // required, min 1
  signal_labels: string[];
  communication_reference?: {
    timing_hint?: string;
    template_key?: string;
  };
  escalation_reference?: {
    policy_basis?: string;
  };
  org_id: string;
  entity: { type: string; id: string };
  locale?: string;
};
```

### 1.2 Prohibited inputs

- Full entity JSON / PII dumps beyond grounded signal subset
- Queue sort scores unrelated to recommendation
- Other operators' actions / cross-org data
- Prior LLM outputs as authoritative facts
- Workflow graph definitions (Workflow Assist owns explain)

### 1.3 Stale-state guard

If `validateRecommendationFreshness` fails or `is_stale === true` → **do not call enrich**; return deterministic projection only.

---

## STEP 2 — AI output contract

### 2.1 Allowed output fields (all optional — omit on failure)

```typescript
type OperationalRecommendationEnrichOutputV1 = {
  title?: string;              // max length enforced
  why_it_matters?: string;
  recommended_action_label?: string;
  likely_outcome?: string;
  review_focus_line?: string;  // suggested focus refinement
  comm_tone_hint?: string;     // Task Assist scaffolding only — not send body
  anomaly_explanation?: string; // from signals only
  proposal_explanation?: string; // governed proposal context
  enrich_meta: {
    model_id: string;
    enriched_at_iso: string;
    fields_enriched: string[];
    grounding_signal_ids: string[];
  };
};
```

### 2.2 Prohibited outputs

| Prohibited | Reason |
|------------|--------|
| Confidence scores / percentages | Confidence theater (Phase 2 banned) |
| Chain-of-thought / reasoning traces | Hidden reasoning |
| New facts not in `grounding_signals` | Hallucination |
| Send-ready message bodies without template anchor | Bypass comms governance |
| Workflow mutations / action execution | Autonomy |
| Permission grants / role changes | Security |
| Record field values to write | Silent mutation |
| “AI recommends you must…” imperative autonomy | Authority claim |

### 2.3 Merge rules

1. Validate output against schema + length + grounding check (each sentence must cite signal id set).
2. Merge into **enrich overlay** on render projection — deterministic DTO unchanged on wire.
3. UI shows provenance footnote on enriched fields only.
4. On any validation failure → silent fallback to deterministic field.

---

## STEP 3 — Validation strategy

| Layer | Check |
|-------|-------|
| Input | Fingerprint fresh; `grounding_signals.length >= 1` |
| Schema | Zod/JSON schema strict |
| Grounding | Each enriched string must reference ≥1 signal label/id (keyword or embedding-free match) |
| Length | Catalog max lengths per field |
| Policy | BOS policy denial → skip enrich (`resolveBosPolicyDenial`) |
| Rate / cost | Org feature flag + per-entity cooldown |

**Hallucination prevention:** Prefer **omit field** over show ungrounded copy.

---

## STEP 4 — Prompt governance

- Prompts live in server-only modules — versioned constants, not inline in routes.
- Prompt templates reference **field names** and **signal summaries** — not raw DB rows.
- No operator PII in prompt logs; audit enrich calls without message bodies.
- Model selection org-configurable behind feature flag `operational_recommendation_ai_enrich_v1`.
- Prompt changes require contract test snapshot update.

---

## STEP 5 — Cards + GATE 4

| Card | Work |
|------|------|
| **4.1** | Enrich route: input/output contracts + validator |
| **4.2** | Merge enrich overlay into drawer/queue/handoff projections |
| **4.3** | Trust badges — `deterministic_vs_ai_assisted` provenance footnotes |
| **4.4** | Task Assist comm tone scaffolding (grounded, not send body) |
| **4.5** | Anomaly explanation from signals (drawer supporting detail) |
| **4.6** | Proposal explanation refinement (governed envelopes) |
| **4.7** | Telemetry: enrich requested / succeeded / fallback / stale blocked |
| **4.8** | Docs: `bos-foundation.md`, `crm-system.md`, ai-system |
| **4.9** | Regression + GATE 4 demo + rollback verification |

### GATE 4 — exit criteria

| # | Criterion |
|---|-----------|
| G4-1 | Enrich accepts only grounded input contract |
| G4-2 | Structured output validated; failures fall back silently |
| G4-3 | No chain-of-thought exposed |
| G4-4 | Provenance visible on AI-touched fields |
| G4-5 | Stale / policy denied → no enrich call |
| G4-6 | No autonomous mutation paths added |
| G4-7 | Deterministic demo path unchanged when flag off |
| G4-8 | Rollback = disable flag → deterministic-only |

---

## STEP 6 — Test strategy

| Test type | Coverage |
|-----------|----------|
| Contract | Input/output schema round-trips |
| Grounding | Ungrounded output rejected |
| Fallback | Validator failure → deterministic copy |
| Stale block | Stale fingerprint → enrich skipped |
| Policy denial | BOS policy → enrich skipped |
| UI | Provenance footnote present only when enriched |
| Regression | Phase 1–3 suites pass with flag off |
| Snapshot | Copy regression for deterministic path |

**No live LLM in CI** — mock enrich provider; optional manual gate checklist.

---

## STEP 7 — Rollback plan

1. **Feature flag off** — `operational_recommendation_ai_enrich_v1` → deterministic-only (default).
2. **Route disable** — enrich endpoint returns 404/disabled; clients use deterministic projections.
3. **No data migration** — enrich is ephemeral overlay; no DB rollback needed.
4. **Verify** — GATE 2 demo script passes with flag off.

---

## STEP 8 — Non-goals (Phase 4)

| Item | Notes |
|------|-------|
| Autonomous send / apply | — |
| Cross-record portfolio AI | Future |
| Agent swarms | Paused program |
| Replacing catalog with LLM | Catalog remains primary |
| Persisting enrich history | Telemetry only |
| Queue reorder LLM | Deterministic only |

---

**Suggested commit message (when implementing):**

```
feat(bos): Phase 4 bounded AI enrich with grounding validators

Add recommendation enrich contract, provenance footnotes, and deterministic
fallback — no autonomous mutation; feature-flagged V1.5 behind GATE 4.
```
