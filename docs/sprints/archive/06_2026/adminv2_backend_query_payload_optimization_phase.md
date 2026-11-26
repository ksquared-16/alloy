# AdminV2 — Backend Query & Payload Optimization (Next Phase)

**Path:** `docs/sprints/archive/06_2026/adminv2_backend_query_payload_optimization_phase.md`  
**Status:** **Backlog** — not active implementation  
**Prerequisite:** Closed runtime consistency sprint — **`docs/sprints/archive/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`**  
**Doctrine (do not regress):** **`docs/system/adminv2-runtime-performance-doctrine.md`**

---

## Scope boundary

This phase optimizes **server query time and payload size** only. It must **not** change:

- reveal gates, composed drawer readiness, or known-empty predicates
- queue empty-state semantics or request apply guards
- cache key contracts (unless paired with determinism test updates)

UI/layout work continues under the locked runtime doctrine.

---

## Backlog

### 1. Waitlist lane query optimization

- **Current staging signal:** waitlist queue `base_query_ms` can still be ~1.6–1.7s.
- Verify new indexes (`20260605100000_waitlist_queue_lane_query_indexes.sql`).
- Inspect query plan on staging.
- Optimize candidate-grain query path.

### 2. Large queue payload trimming

- **Current signal:** `needs_attention` can return ~82 rows / ~334KB.
- Evaluate page size, field trimming, and preview-only enrichment.
- Keep queue rows preview/selection semantics per workspace doctrine.

### 3. Opportunity full hydrate optimization

- Remaining cost drivers: identity roles, OCM join, primary role, opportunity person list.
- Reduce duplicated work between drawer primary / bootstrap / full hydrate.
- Preserve composed first-paint contract.

### 4. Workspace / dept context cache efficiency

- **Current signal:** entity labels / admin context can be 400–1000ms on cold paths.
- Cache and bundle where safe without weakening org/scope isolation.

### 5. Messages route duplicate navigation / loading

- Logs show repeated `/adminV2/messages` loads.
- **Separate sprint** — see messaging v2 docs under `docs/sprints/archive/06_2026/messaging_v2_*.md`.

---

## Success criteria (when activated)

| Metric | Direction |
|--------|-----------|
| Waitlist lane `base_query_ms` | Materially below ~1.7s staging baseline |
| NA lane payload KB | Reduced without losing preview contract |
| Opportunity full hydrate | Lower p95; no regression on composed open |
| Cold admin context | Lower p95 on dept/WU first nav |

All changes must pass the runtime test suite in `adminv2-runtime-performance-doctrine.md`.

---

## Activation

Pick items when product priority allows. Do **not** interleave with ordinary UI tasks without explicit performance sprint approval.
