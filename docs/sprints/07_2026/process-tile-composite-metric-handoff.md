# Process Tile — composite metric + preview/runtime parity (handoff)

**Status:** Landed (presentation only).  
**Scope:** `ProcessSummaryCard`, Surface Builder preview honesty, lifecycle landing signal cache.

## Landed

- **Preview/runtime parity:** Surface Builder preview no longer fabricates attention badges, work-view counts, healthy KPI state, or fake Today's Work rows. It uses the same `ProcessSummaryCard` with unresolved metric placeholders the live runtime shows before data settles.
- **Composite metric rendering:** When primary + supporting Operational Calculations both resolve, the card composes one line: `{primaryValue} {primaryLabel} • {supportingValue} {supportingLabel}` (e.g. `25 Families • 42 Children`). Labels come from Surface Builder config only.
- **Operational signal cache:** `loadOperatorLifecycleLandingClient` no longer caches lifecycle cards when per-view operational signal enrichment times out (prevents permanent missing attention/overdue badges).

## Registry audit — “Families” primary metric

Searched `web/lib/analytics/calculations/registry.ts`, `web/lib/metrics/registry.ts`, and enrollment/ops resolvers for:

| Candidate | Result |
|-----------|--------|
| Opportunity / case count (active pipeline) | **Not registered** as a `business_process_tile` calculation |
| Household / family count | **Not registered** |
| Work view total | Queue operational projection only — not an OIP calculation |
| Process active count (`activeRecordCount` footer) | Department queue-summary rollup — **not** selectable as Primary Signal |
| `enrollment.lead_count` | **Deprecated alias** → resolves to `enrollment.active_leads` at **participant (child) grain**, not opportunity/case |
| `enrollment.active_leads` / `new_leads` / `waitlisted` | Participant grain (`process_instances`) |
| `ops.needs_attention_count` | Opportunity grain, but counts records **needing attention** — not active families |
| `ops.readiness_gap_count` | Opportunity grain, readiness gaps only |

**Conclusion:** No existing tile-consumable calculation can serve as a true “Families” (opportunity/case-grain active pipeline count). The tile footer “X active” (`activeRecordCount` from `work_unit_scope_total`) is the closest operational number but is not wired into the Primary Signal picker.

## Next smallest registry gap (do not build in this slice)

Add **`enrollment.active_families`** (or rename/registry-align an opportunity-grain active count):

- **Grain:** opportunity / case (distinct `opportunities.id` in pipeline scope — same grain as queue row membership and `work_unit_scope_total`)
- **Semantics:** live enrollment opportunities in the process work unit, excluding closed/withdrawn/not-enrolling household contexts (mirror enrollment participant “live” rules at case grain)
- **Consumer:** `business_process_tile` (+ optional `workspace_header`)
- **Resolver:** count via operational projection or scoped opportunities query — must not fork from queue canonical location
- **Pairing:** configure as Primary Signal with label override `Families`; set Supporting Signal to `enrollment.active_leads` with label override `Children` for composite display

Until that calculation ships, composite display works in the renderer but both sides resolve participant counts if operators pick only existing enrollment participant metrics.

## Update (landed on staging)

**`enrollment.active_families`** is now registered:

- **Grain:** opportunity/case (`distinct context_id` among `isActiveLeadParticipant`)
- **Resolver:** `resolveEnrollmentActiveFamilies` — same enrollment projection + semantics as `enrollment.active_leads`
- **Consumer:** `business_process_tile`

**Surface Builder config for `25 Families • 42 Children`:**

1. Primary metric: `enrollment.active_families` — title override `Families`
2. Supporting metric: `enrollment.active_leads` — title override `Children`
