# AdminEntityDrawer Runtime — Cards 4–7 Implementation Plan

**Date:** 2026-05-20  
**Status:** In implementation (Cards 4–7)  
**Authority:** [`adminv2_drawer_runtime_phase0_audit.md`](./adminv2_drawer_runtime_phase0_audit.md), [`adminv2_dept_runtime_closeout_handoff.md`](./adminv2_dept_runtime_closeout_handoff.md), [`adminv2_work_unit_runtime_cards_1_3_plan.md`](./adminv2_work_unit_runtime_cards_1_3_plan.md) (Runtime Contract V1)

**Scope:** Opportunity drawer in `AdminEntityDrawer` on AdminV2 workspace routes. **No `/dept` or `/work-unit` page/route changes.**

---

## AdminV2 Runtime Contract V1 (drawer adaptation)

```txt
instant drawer shell (seed + fixed geometry)
→ isolated header/body reserves (no route-wide collapse)
→ one drawer-operational-bootstrap (one loadAdminRouteGate)
→ bundled shell: drawer_visible entity + record_layout + record_header_actions + work_unit scope
→ optional oper_trust_preview (client-hint echo only — v1 hard rule below)
→ authoritative oper reveal (NOT gated on surface=full)
→ scheduleAdminV2BackgroundWork: full hydrate + secondary + tab-local
→ full hydrate attaches _operational_attention (single attach pass)
```

---

## Implementation sequence (strict order)

| Order | Card | Why this order |
|------:|------|----------------|
| A | **4** | Geometry + instant shell work without server contract — unblocks perceived open |
| B1 | **5** | Server loader + route + types + perf log + contract tests |
| B2 | **5** | Client bootstrap happy path + reveal gate decoupling |
| B3 | **5** | Intent prefetch → bootstrap URL; legacy fan-out fallback |
| C | **6** | Move full hydrate + idle work to `scheduleAdminV2BackgroundWork`; drop critical-path `record-actions` |
| D | **7** | BOS + attention strip + compact strip coherence after full hydrate |

Do **not** start Card 6 until Card 5 happy path is wired. Card 7 can overlap Card 6 only for gating/tests that do not reintroduce critical-path fetches.

---

## 1. Exact files to modify

### Card 4 — Shell geometry + instant open

| File | Change |
|------|--------|
| `web/lib/ui-v2/adminV2LoadingGeometry.ts` | Add drawer header/title-rail/timeline constants if missing; document `quiet_reserve` vs `row_skeleton` for drawer |
| `web/components/admin/AdminEntityDrawer.tsx` | `drawerShellInstant` gate; ensure panel opens before bootstrap returns; stabilize reserves |
| `web/app/adminV2/components/workspace/workspace.css` | Optional: drawer shell transition tokens aligned with WU soft-reveal |
| `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` | Contracts for instant shell, seed title, region reserves |

### Card 5 — Drawer operational bootstrap

| File | Change |
|------|--------|
| `web/app/api/admin/opportunities/[id]/drawer-operational-bootstrap/route.ts` | **NEW** — GET, `loadAdminRouteGate` |
| `web/lib/admin/loadOpportunityDrawerOperationalBootstrap.ts` | **NEW** — phased loader |
| `web/lib/admin/opportunityDrawerOperationalBootstrapTypes.ts` | **NEW** — request/response types |
| `web/lib/admin/opportunityDrawerOperationalBootstrapPerf.ts` | **NEW** — `[drawer-bootstrap-perf]` |
| `web/lib/admin/opportunityEntityRecord.ts` | Extract `buildOpportunityDrawerVisiblePayload(...)` callable from loader (no HTTP self-call) |
| `web/lib/admin/effectiveRecordDrawerLayout.ts` | Reuse `fetchEffectiveRecordDrawerLayout` |
| `web/lib/admin/actions/resolveActionsForContext.ts` | Reuse for `record_header` slice |
| `web/components/admin/AdminEntityDrawer.tsx` | Bootstrap fetch/apply; reveal gates; legacy fallback branch |
| `web/lib/admin/opportunityDrawerIntentPrefetch.ts` | Prefetch bootstrap URL instead of visible + actions |
| `web/hooks/useRecordChromeConfig.ts` | Opportunity + AdminV2: skip parallel layout/actions fetch when bootstrap supplies layout (see §5) |
| `web/tests/workspace/opportunityDrawerOperationalBootstrap.test.ts` | **NEW** — route, gate, payload, no heavy attention |
| `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` | Bootstrap-before-fan-out contracts |
| `web/lib/perf/adminV2DrawerPerf.ts` | Bootstrap phase marks |

**No changes:** `web/app/adminV2/workspace/dept/**`, `web/lib/workspace/loadDeptOperationalBootstrap.ts`, `web/lib/workspace/loadWorkUnitOperationalBootstrap.ts`

### Card 6 — Deferred full hydrate + secondary/tab-local

| File | Change |
|------|--------|
| `web/components/admin/AdminEntityDrawer.tsx` | `requestOpportunityDrawerDeferredWork()` via `scheduleAdminV2BackgroundWork`; remove critical-path `useRecordChromeConfig` actions fetch for AdminV2 opportunity; gate tour bookings hook |
| `web/lib/workspace/adminV2DeferBackgroundWork.ts` | No API change — consume only |
| `web/lib/admin/communications/communicationsDrawerPrefetch.ts` | Ensure called from deferred wave only (already layoutEffect — verify not duplicated) |
| `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts` | `scheduleAdminV2BackgroundWork` for full hydrate; no `record-actions` on happy path |
| `web/tests/workspace/opportunityDrawerOperationalBootstrap.test.ts` | Deferred path does not block oper reveal |

### Card 7 — Header / attention / BOS coherence

| File | Change |
|------|--------|
| `web/components/admin/AdminEntityDrawer.tsx` | BOS context from bootstrap entity; strip gating; `oper_trust_preview` until full |
| `web/lib/adminV2/bos/activeOperationalContext.ts` | Prefer bootstrap entity over seed when applied; document `source_surface` |
| `web/components/admin/opportunity/OpportunityOperationalCompactStrip.tsx` | Trust line from `oper_trust_preview` / seed until full `_operational_summary` |
| `web/components/admin/drawer/OperationalAttentionHeaderStrip.tsx` | No bootstrap `_operational_attention`; render only when full hydrate present |
| `web/tests/admin/adminEntityDrawerBosContext.contract.test.ts` | Bootstrap entity seeds assistant |
| `web/tests/agent/taskAssist/opportunityOperationalCompactStrip.contract.test.ts` | Strip deferred / preview line |
| `web/tests/admin/drawer/operationalAttentionSuggestionUi.test.tsx` | Unchanged behavior after full hydrate |

### Incidental (only if required by types)

| File | Change |
|------|--------|
| `web/lib/admin/opportunityDrawerQueuePreviewSeed.ts` | Optional: `operationalSummaryHeadline`, `riskUrgencyHint` from queue row for query hints |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | Pass extended seed fields into `openDrawer` (no bootstrap logic) |

---

## 2. Bootstrap route shape

### Route

`GET /api/admin/opportunities/{opportunityId}/drawer-operational-bootstrap`

### Auth

- **Single** `loadAdminRouteGate()` at route entry (mirror `operational-bootstrap` routes).
- `createAdminClient()` after gate; `assertRowOrg` on `opportunities` row.

### Query parameters

| Param | Required | Purpose |
|-------|----------|---------|
| `department_id` | When `work_unit_id` set | Header action resolution scope |
| `work_unit_id` | Recommended from queue open | WU row + `record_header` + timeline |
| `hint_opportunity_status_key` | Optional | Action conditions (parity with `/api/admin/actions`) |
| `hint_opportunity_metadata` | Optional JSON | Action conditions |
| `hint_oper_trust_headline` | Optional | Max 140 chars — queue row preview headline (presentation echo) |
| `hint_oper_trust_urgency` | Optional | `low` \| `medium` \| `high` — queue row urgency |

**Not accepted:** `surface=full`, tab keys, queue lane keys, attention bucket keys.

### Server phases (loader)

```txt
gate_ms
→ assert opportunity org + optional assert work_unit org
→ parallel:
     A) buildOpportunityDrawerVisiblePayload (extracted drawer_visible branch)
     B) fetchEffectiveRecordDrawerLayout(opportunity)
     C) work_units select (id, department_id, queue_definition, metadata) when work_unit_id
→ record_header: resolveActionsForContext when dept+wu present (hints from query + visible row)
→ oper_trust_preview (sanitize/echo client hints only — no server compute)
→ assemble JSON + log [drawer-bootstrap-perf]
```

### Hard v1 rule — `oper_trust_preview` (client-hint only)

For v1, `oper_trust_preview` is **client-hint only**.

The drawer bootstrap may **sanitize and echo** trusted queue seed hints (`hint_oper_trust_headline`, `hint_oper_trust_urgency`). It must **not** compute fallback operational attention server-side.

Full `_operational_attention` (and `_attention_suggestion`, full `OperationalSummaryV1`) remain available **only** after deferred `surface=full` hydrate (Card 6).

### Explicitly forbidden in drawer bootstrap

| Forbidden | Notes |
|-----------|--------|
| `loadOpportunityNeedsAttentionRows` | Queue NA / attention list resolver |
| `attachOpportunityAttentionSuggestionBundle` | Full attention + suggestion attach |
| `computeOperationalAttentionAttachment` | Sync or async attention evaluator |
| Activity DB reads | e.g. `loadOpportunityActivitySignal` |
| Queue attention resolver work | `buildOpportunityAttentionQueueItems`, dept preview, bucket builders |
| Inquiry children batch, member-person graph, related/documents/comms/workflows | Deferred / tab-local |

**Invariant:** `attention_resolver_passes` must always be **`0`** in bootstrap timing/perf payloads.

**Never** include `_operational_attention`, `_attention_suggestion`, or full `OperationalSummaryV1` in bootstrap.

---

## 3. Bootstrap payload shape

```ts
/** Presentation-authoritative for drawer shell only — not mutation/invalidation truth. */
export type OpportunityDrawerOperationalBootstrapResponse = {
  entity: Record<string, unknown>; // _record_surface: "drawer_visible"
  record_layout: {
    source: "org_drawer_override" | "global_template";
    key: string;
    config_json: RecordLayoutConfigJson;
    inquiry_drawer_mode: "workflow_v1" | "classic" | null; // derived for client
  } | null;
  record_header_actions: ResolvedActionsBySlot | null;
  work_unit: {
    id: string;
    department_id: string;
    queue_definition: QueueDefinitionV1 | null;
  } | null;
  workspace_scope: {
    department_id: string | null;
    work_unit_id: string | null;
  };
  /** Lightweight trust signals for header/compact strip — NOT full attention attach */
  oper_trust_preview: {
    headline: string;
    risk_urgency_hint: "low" | "medium" | "high";
  } | null;
  timing?: {
    route_gate_ms: number;
    phases_ms: Record<string, number>;
    attention_resolver_passes: 0; // always 0 on drawer bootstrap
  };
};
```

### Payload budget (~100 KB compressed)

| Include | Exclude |
|---------|---------|
| `drawer_visible` fields (existing branch) | `_field_definitions`, `_field_values`, inquiry_children |
| Layout `config_json` (single effective row) | Full `record-actions` registry catalog |
| Resolved header slots (typically &lt;20 actions) | `surface=full` blobs |
| WU `queue_definition` JSON | Queue row arrays |
| `oper_trust_preview` (&lt;200 bytes) | `_operational_attention`, suggestion objects |

---

## 4. Client apply / reveal sequence

### Open (AdminV2 opportunity)

```txt
1. openDrawer({ seed, opportunityWorkspaceContext })  // seed unchanged, presentation-only
2. drawerShellInstant = true (panel visible, geometry locked)
3. If type=opportunities && id!=new && drawerShellVariant=adminV2:
     build bootstrap URL from workspaceContext + seed hints
     dedupeAdminFetch(bootstrap)
   Else:
     legacy fan-out (unchanged)
4. On bootstrap OK:
     setData(entity) if entityDataMatchesDrawer
     apply record_layout → skip useRecordChromeConfig fetch (configResolved=true, layout seeded)
     setOpportunityResolvedHeaderActions(record_header_actions)
     setOpportunityQueueDefinition / opportunityWorkUnitDepartmentId from work_unit
     setOperTrustPreview state from oper_trust_preview or seed
     opportunityDrawerBootstrapAppliedRef = id
5. Reveal gates (Card 4/5):
     drawerEntityShellReady = bootstrap entity applied
     drawerLayoutReady = record_layout != null (or explicit classic fallback)
     drawerHeaderActionsReady = !scoped || actions != null || resolved empty terminal
     opportunityDrawerOverviewRevealReady =
       drawerEntityShellReady && drawerLayoutReady && drawerHeaderActionsReady
       && NOT opportunityFullHydratePending   // ← CHANGE: remove full hydrate from this gate
6. reportDrawerVisibleApplied / reportDrawerPrimaryReady (existing perf)
7. scheduleAdminV2BackgroundWork → Card 6 deferred bundle
```

### `useRecordChromeConfig("opportunity")` on AdminV2

When `opportunityDrawerBootstrapAppliedRef` matches current id:

- Set `layout` from bootstrap `record_layout` mapped to `RecordLayoutRow` shape.
- Set `actions` to `[]` (registry header is canonical; avoids `record-actions` HTTP).
- Set `configResolved: true` immediately on open; do not refetch layout/actions on happy path.

Jobs/schedules: **unchanged** (still use hook fetches).

---

## 5. Legacy fallback behavior

Trigger legacy path when **any** of:

- Bootstrap HTTP non-OK or network error
- Response `entity.id` !== drawer id
- `drawerShellVariant !== "adminV2"` (legacy admin stack)
- `drawer.type !== "opportunities"` or `id === "new"`
- Feature kill-switch env `ADMINV2_DRAWER_BOOTSTRAP=0` (optional, dev only)

Legacy path = **today’s behavior** (preserve product correctness):

1. `GET entity?surface=drawer_visible`
2. `useRecordChromeConfig` → `record-layouts` + `record-actions`
3. `GET /api/admin/actions` when scoped
4. `fetchAdminWorkUnitDrawerJson`
5. Background `surface=full` (may still block reveal until Card 6 legacy parity — document as known fallback degradation)

**Do not delete** legacy effects until bootstrap is verified on staging. Log `[drawer-bootstrap-fallback]` once per open in dev.

---

## 6. Deferred / background work plan (Card 6)

Single coordinator: `requestOpportunityDrawerDeferredWork(opportunityId)` scheduled via `scheduleAdminV2BackgroundWork` **after** `opportunityDrawerOverviewRevealReady` (or immediately after bootstrap apply if reveal is synchronous).

| Work item | Prior timing | New timing |
|-----------|--------------|------------|
| `surface=full` entity hydrate | Parallel at open; **blocked reveal** | Deferred wave 1 |
| `relationship_member_persons` | After full | Deferred wave 1 chain |
| `activity-signal` | `requestIdleCallback` | `scheduleAdminV2BackgroundWork` wave 2 |
| `scheduleDeferredCommunicationsDrawerPrefetch` | `useLayoutEffect` at open | Keep early reserve; HTTP inside helper stays deferred |
| Ref selects (`location-options`, etc.) | postDrawerVisible | Deferred wave 2 |
| `pipeline-stages` | postDrawerVisible | Deferred wave 2 |
| `deletion-eligibility` | postDrawerVisible | Deferred wave 2 |
| `prefetchWorkspaceChildcareInquiryOptionSets` | postDrawerVisible | Deferred wave 2 |
| `useOpportunityActiveTourBookings` | Mount on header | Defer until header actions rendered or first hover on schedule CTA |
| `OpportunityOperationalCompactStrip` fetches | secondaryReady | Keep behind `opportunityDrawerSecondaryReady` |
| Tab: activity / related / documents | tab focus | **Unchanged** tab-local |

`postDrawerVisibleKey` (+2 rAF): retain as **secondary scheduling trigger**, but do not use it to start critical fetches.

---

## 7. Runtime perf markers

Extend `web/lib/perf/adminV2DrawerPerf.ts`:

| Mark | When |
|------|------|
| `drawer_bootstrap_request_start` | Before bootstrap fetch |
| `drawer_bootstrap_response` | JSON received |
| `drawer_bootstrap_applied` | State applied (+2 rAF optional) |
| Existing `drawer_opportunity_visible_req/applied` | Map to bootstrap entity apply on happy path |
| Existing `drawer_primary_ready_at` | Fires when `opportunityDrawerOverviewRevealReady` without full hydrate |
| Existing `drawer_opportunity_full_applied` | Unchanged — after deferred full |

Server: `[drawer-bootstrap-perf]` via `opportunityDrawerOperationalBootstrapPerf.ts`:

- `route_gate_ms`, `visible_entity_ms`, `record_layout_ms`, `record_header_actions_ms`, `work_unit_ms`, `oper_trust_preview_ms`, `total_ms`, `attention_resolver_passes: 0`

---

## 8. Tests / contracts

### New: `web/tests/workspace/opportunityDrawerOperationalBootstrap.test.ts`

- Route file exists; uses `loadAdminRouteGate` (source scan)
- Loader does **not** reference `loadOpportunityNeedsAttentionRows`, `attachOpportunityAttentionSuggestionBundle`, `loadOpportunityActivitySignal`
- Response type includes `entity`, `record_layout`, `record_header_actions`, `work_unit`, `oper_trust_preview`
- `attention_resolver_passes` always 0 in perf payload
- No `_operational_attention` in bootstrap response builder

### Update: `web/tests/admin/adminV2DrawerLoadingCoherence.test.ts`

- Card 4: `drawerShellInstant` / seed title / body reserve constants
- Card 5: `drawer-operational-bootstrap` before legacy `drawer_visible` fan-out; `opportunityDrawerOverviewRevealReady` not tied to `opportunityFullHydratePending`
- Card 6: `scheduleAdminV2BackgroundWork` for deferred full hydrate; no critical-path `record-actions?entity_type=opportunity`
- Card 7: BOS uses bootstrap entity; strip waits for full hydrate for `_operational_attention`

### Regression (must stay green)

- `web/tests/workspace/deptOperationalBootstrap.test.ts`
- `web/tests/workspace/workUnitOperationalBootstrap.test.ts`
- `web/tests/admin/adminEntityDrawerBosContext.contract.test.ts`
- `web/tests/agent/taskAssist/opportunityOperationalCompactStrip.contract.test.ts`

### Manual staging checklist

- [ ] One bootstrap HTTP before primary reveal (network tab)
- [ ] Primary reveal &lt; full hydrate (tabs visible before overview fields populate)
- [ ] Seed title until bootstrap entity; entity title after apply — not overwritten by seed
- [ ] Header actions single source (no triple fetch)
- [ ] `oper_trust_preview` or seed line visible; full attention strip after full hydrate
- [ ] Bootstrap compressed size documented (&lt;100 KB target)
- [ ] Fallback: disable bootstrap → legacy still works

---

## 9. Risks to existing drawer behavior

| Risk | Mitigation |
|------|------------|
| Bootstrap entity stale vs PATCH truth | Mutations still `refetch()` + `adminv2:opportunity-updated`; bootstrap not write authority |
| Wrong WU scope for actions | `workspace_scope` from open context; bundle ignores stale entity WU until apply |
| Classic (non-workflow) drawer regression | Legacy fallback + `inquiry_drawer_mode` branch tests |
| Opening drawer outside AdminV2 | `drawerShellVariant !== adminV2"` → legacy path |
| Layout config drift | Bootstrap `record_layout` must map to same shape `useRecordChromeConfig` expects |
| Primary reveal before fields ready | Overview shows shell/sections skeleton per section; no second global loading shell |
| `oper_trust_preview` diverges from full attention | Label as preview in UI; replace after full hydrate without layout jump (same headline slot) |
| Intent prefetch stale on fast click | `dedupeAdminFetch` + abort on id change |
| Payload bloat from `config_json` | Monitor staging; trim if org overrides huge |
| Non-opportunity entities | Unaffected — no bootstrap route call |

---

## 10. Acceptance criteria

### Card 4

1. Drawer panel opens immediately on `openDrawer` with stable min-heights (title rail, timeline, body reserve).
2. Queue preview seed prevents generic “Inquiry” / “Loading opportunity” flash when seed present.
3. Loading isolated to header/body regions — no workspace route collapse.

### Card 5

4. Happy path (AdminV2 opportunity): **one** `drawer-operational-bootstrap` HTTP before oper reveal.
5. **One** `loadAdminRouteGate` per bootstrap request.
6. Bootstrap bundles visible entity + layout + `record_header_actions` + work unit scope.
7. **No** critical-path `GET entity?drawer_visible`, `record-layouts`, `record-actions`, or separate `work-units` fetch on happy path.
8. `opportunityDrawerOverviewRevealReady` **does not** depend on `surface=full`.
9. Legacy fan-out intact on bootstrap failure / non-AdminV2.
10. Intent prefetch targets bootstrap URL.

### Card 6

11. `surface=full` + member overlay run via `scheduleAdminV2BackgroundWork` after oper reveal.
12. Activity-signal and ref-data fetches not on critical path.
13. Tab-local loads unchanged (activity/related/documents only on tab).

### Card 7

14. `OperationalAttentionHeaderStrip` renders `_operational_attention` only after full hydrate.
15. `oper_trust_preview` and/or seed powers header/compact-strip trust until full hydrate.
16. `buildOpportunityOperationalContext` uses bootstrap-applied entity; seed is preview-only for label fallback.
17. Bootstrap includes **no** `_operational_attention`; `attention_resolver_passes === 0`; `oper_trust_preview` is **client-hint echo only** (no `computeOperationalAttentionAttachment`).

### Cross-cutting

18. Queue preview seed remains presentation-only.
19. Bootstrap is not mutation truth; `surface=full` remains deferred entity truth.
20. `/dept` and `/work-unit` tests and behavior unchanged.
21. Payload target ~100 KB compressed documented on staging enrollment opportunity sample.

---

## Card-by-card checklist (engineering)

### Card 4 — Drawer shell geometry + instant open

- [ ] Audit `ADMINV2_DRAWER_*` constants vs rendered workflow header/timeline/body
- [ ] `drawerShellInstant` — panel + backdrop before async return
- [ ] Seed-driven title/subtitle/timeline reserves unchanged in behavior
- [ ] Contract tests updated

### Card 5 — Opportunity drawer operational bootstrap

- [ ] New route + loader + types + perf
- [ ] Extract `buildOpportunityDrawerVisiblePayload` from `opportunityEntityRecord.ts`
- [ ] Client apply + reveal decoupling
- [ ] `useRecordChromeConfig` bypass for AdminV2 opportunity happy path
- [ ] Intent prefetch migration
- [ ] Legacy fallback + logging

### Card 6 — Deferred full hydrate + secondary/tab-local

- [ ] `requestOpportunityDrawerDeferredWork` coordinator
- [ ] Remove `record-actions` from critical path (AdminV2 opportunity)
- [ ] Tour bookings lazy gate
- [ ] Standardize idle fetches on `scheduleAdminV2BackgroundWork`

### Card 7 — Header / attention / BOS coherence

- [ ] `oper_trust_preview` state wired to compact strip + optional header line
- [ ] BOS context from bootstrap entity
- [ ] Full hydrate replaces preview without duplicate strips
- [ ] Contract tests for BOS + strip + attention gating

---

## Suggested commit messages (when implementing)

1. `perf(adminv2): drawer shell geometry and instant open (card 4)`
2. `perf(adminv2): opportunity drawer operational bootstrap (card 5)`
3. `perf(adminv2): defer drawer full hydrate and secondary loads (card 6)`
4. `perf(adminv2): drawer oper attention and BOS context coherence (card 7)`

Or single squash after all cards: `perf(adminv2): opportunity drawer runtime replication (cards 4–7)`

---

## Out of scope

- Jobs / schedules / contacts drawer bootstrap
- `/dept` / `/work-unit` operational bootstrap changes
- DB indexes / attention SQL tuning
- Drawer layout editor / settings preview changes
- Replacing `surface=full` with bootstrap for mutations or field edits
