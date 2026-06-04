# Work Unit VM Cutover Sprint — WU-VM-0 / WU-VM-1 + Queue UX

**Path:** `docs/sprints/06_2026/work_unit_vm_cutover_sprint_wu0_wu1.md`  
**Status:** WU-VM-0/1 verified · WU-VM-2 cache foundation · WU-VM-3/4 plans documented (June 2026)  
**Audit:** `docs/audits/work_unit_runtime_cutover_audit.md`  
**UX baseline:** `docs/sprints/06_2026/work_unit_queue_ux_redesign_proposal.md`

---

## Phase 1 — Baseline & shadow (this pass)

### Baseline findings

| Check | Status |
|-------|--------|
| WU-VM-0 marks wired in `page.tsx` | Active |
| `reportWorkUnitVmRuntimeBaseline()` | DevTools global |
| WU-VM-1 shadow compose | Gated by `NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM_SHADOW=1` |
| Shadow re-runs on actions settle | Sig includes `queueRowActionsReady` + `enrollmentActionsSettled` |

All required console events:

| Event | Module |
|-------|--------|
| `wu_vm_open_start` | `workUnitVmRuntimeTrace.ts` |
| `wu_vm_open_cold` / `wu_vm_open_warm_cache` | `page.tsx` nav reset |
| `wu_vm_bootstrap_apply` | bootstrap apply effect |
| `wu_vm_queue_ready` | lane rows settled |
| `wu_vm_kpi_ready` | KPI placements resolved |
| `wu_vm_first_paint_ready` | above-fold coordinated |
| `wu_vm_actions_ready` | row + right rail both settled |
| `wu_vm_row_actions_ready` | queue row registry hydrated |
| `wu_vm_right_rail_actions_ready` | bootstrap/deferred rail settled |
| `wu_vm_shadow_compose` / `wu_vm_shadow_diff` | shadow runner |

### Shadow parity summary

Shadow diff now compares:

- Identity + first_paint + queue lane + KPI strip state (existing)
- `row_action_count`, `right_rail_action_count`, `action_availability_state`
- `row_action_keys`, `right_rail_action_keys` with `missing_action_ids` / `extra_action_ids`

**Known intentional gaps (not mismatches):**

- `first_paint_settled` may differ while row actions still pending — VM contract now models this explicitly via `row_queue_actions` dependency
- KPI remains `background_deferred` — strip may paint after queue without blocking first paint contract
- Live row actions still hydrate via `/api/admin/actions?surface=queue_row` post-bootstrap — VM models availability state; cutover (WU-VM-3) must embed actions in bootstrap payload

**No hard cutover in this pass.**

---

## WorkUnitViewModel actions contract (shadow-only)

```typescript
actions: {
  row_actions_by_record_id: Record<string, RowAction[]>;
  right_rail_actions: RightRailAction[];
  action_availability_state: "ready" | "empty";
}
```

First-paint dependencies: `row_queue_actions`, `right_rail_actions` (plus legacy `enrollment_actions` alias).

---

## Phase 2 — WU-VM-2 session cache (foundation)

**Module:** `web/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache.ts`

Cache key includes:

- org id, department id, work unit id, user id, scope fingerprint
- selected queue key, attention bucket, unmapped-only flag, record filter fingerprint

Supports:

- `putWorkUnitViewModelCacheEntry` / `peekWorkUnitViewModelCacheEntry`
- TTL (5 min default) + optional `expectedGeneration` stale guard
- `invalidateWorkUnitViewModelCacheForWorkUnit` for generation bumps

**Not wired to page render yet** — no visible behavior change until WU-VM-3 cutover validates cache safety.

---

## Phase 3 — WU-VM-3 first-paint cutover plan

### Goal

Single authoritative `WorkUnitViewModel` payload drives above-fold first paint. Legacy page orchestration becomes fallback only.

### Cutover steps

1. **Flag:** `NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM=1` (soft) → `NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM_HARD=1` (remove legacy path)
2. **Compose server-side** in operational-bootstrap response (extend bootstrap JSON with `view_model` block mirroring client compose)
3. **Bind render** — `WorkUnitPageLoadingGate` + above-fold slots read VM only:
   - queue lane rows from `vm.queue` + embedded row presentation payloads
   - KPI strip from `vm.kpi` (non-gating — `background_deferred`)
   - actions rail + row actions from `vm.actions` (no post-first-paint `/actions` fetch)
   - attention/summary panels from `vm.above_fold`
4. **Session cache read on warm open** — peek VM cache before bootstrap; apply if generation matches; background revalidate
5. **Retire operational-bootstrap ownership** for first paint — bootstrap becomes VM producer, not page state peel
6. **Legacy fallback** — if VM compose fails or flag off, existing page path unchanged

### First paint commit includes

- queue rows + row-level actions
- right rail actions (stable empty if none)
- KPI/summary shell
- header pills + attention context

### Tests required before hard cutover

- VM first_paint settled requires actions ready/empty
- No action skeleton pop-in on VM path
- Warm cache reopen applies without lane flash
- Stale bootstrap generation rejected

---

## Phase 4 — KPI / pill model-swap prep

### Architecture

| Pill click | Behavior |
|------------|----------|
| Cached lane VM | Instant queue model swap — no shimmer, no page teardown |
| Uncached lane | Current queue remains visible until target VM ready, then atomic swap |
| Background | Prefetch adjacent pill VMs on idle |

### Cache model

- One `WorkUnitViewModel` per `(org, dept, wu, queueKey, filters…)` lane key
- Pill switch = `peekWorkUnitViewModelCacheEntry` → hit: swap `queueModel` binding; miss: fetch + compose + put

### Preload triggers

- Hover/focus on adjacent pills (idle)
- Post-first-paint prefetch for top-N pills by count
- Sibling work unit navigation shares org/dept context in cache key

### Stale guard rules

- Generation = `{wuId}:{queueKey}:{bootstrapRevision}:{actionsRevision}`
- Discard cache entry when generation mismatch or TTL exceeded
- Pill switch request seq — same pattern as `shouldApplyWorkUnitQueueRowsResponse`

### Required tests

- Cached pill switch: zero row flash, `wu_vm_pill_switch_cache_hit` logged
- Uncached pill: no empty-state flash while prior lane visible
- VM swap does not reset drawer or scroll position

---

## Track B — Queue UX (header consolidation)

### This pass

- Enrollment header subline now consolidates reason + next step + hint + lifecycle summary when under 140 chars
- Waitlist header subline via `buildWaitlistHeaderSubline` (priority, sibling, forecast)
- Parent contact meta: 11px / 78% opacity (~10% smaller than 11.5px name, less muted)

### Preserved

- Household-first header, status right of name, child/parent icons, compact density, waitlist ranking chips

---

## Track A — WU-VM-0 Instrumentation

### Diagnostics

Filter DevTools console: `[wu_vm_*]`

| Event | When |
|-------|------|
| `wu_vm_open_start` | Route navigation / work unit mount |
| `wu_vm_open_warm_cache` | Session shell cache hit |
| `wu_vm_open_cold` | Cold open (no shell cache) |
| `wu_vm_bootstrap_apply` | operational-bootstrap applied |
| `wu_vm_shell_ready` | Shell identity ready |
| `wu_vm_summaries_ready` | Queue pill summaries ready |
| `wu_vm_queue_ready` | Active lane rows ready |
| `wu_vm_kpi_ready` | KPI placements resolved |
| `wu_vm_first_paint_ready` | Above-fold coordinated reveal |
| `wu_vm_pill_switch_start` | Pill click |
| `wu_vm_pill_switch_cache_hit` | Lane cache hit on pill switch |
| `wu_vm_pill_switch_apply` | Pill switch rows applied |

### Baseline report

```javascript
reportWorkUnitVmRuntimeBaseline()
```

Returns cold/warm/shell/summaries/queue/kpi/first_paint/pill_switch timings from `window.__alloyPerf.marks`.

### Measure protocol (staging)

1. Hard refresh → open work unit → `reportWorkUnitVmRuntimeBaseline()` (cold)
2. Navigate away → return same work unit → report (warm)
3. Click adjacent queue pill → report (pill_switch)

Record results in sprint notes before WU-VM-2.

---

## Track A — WU-VM-1 Shadow Compose

### Enable

```bash
# web/.env.local
NEXT_PUBLIC_ADMINV2_WORK_UNIT_VM_SHADOW=1
```

### Behavior

- `composeWorkUnitViewModel()` builds VM from **existing page state** — no new fetches
- `scheduleWorkUnitViewModelShadow()` runs after above-fold ready
- Logs `[wu_vm_shadow_compose]` and `[wu_vm_shadow_diff]`
- **No UI change, no ownership change, no cutover**

### Modules

| Path | Role |
|------|------|
| `web/lib/adminV2/viewModel/workUnit/types.ts` | VM + compose input types |
| `web/lib/adminV2/viewModel/workUnit/composeWorkUnitViewModel.ts` | Client compose |
| `web/lib/adminV2/viewModel/workUnit/shadow/*` | Live snapshot + diff |
| `web/lib/adminV2/viewModel/workUnit/extractWorkUnitViewModelActions.ts` | Actions contract builder |
| `web/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache.ts` | WU-VM-2 session cache |
| `web/lib/perf/workUnitVmRuntimeTrace.ts` | WU-VM-0 marks + baseline |

---

## Track B — Queue UX (header + people bands)

### Shipped

- `CrmCompactOperationalRecord` — single subtle frame per row
- **Header band:** status pill + household + location
- **People band:** parent/child rows with drawer icons (left of name), compact (no column labels)
- **Facts band:** timing/meta when present (minimal, no extra height)
- CSS: `adminv2-ws-queue-operational-record*` in `workspace.css`

### Not changed

- Queue runtime, reveal gates, fetch paths
- Drawer VM / model swap
- Row click → opportunity behavior

### Mockup

`web/public/dev/work-unit-queue-operational-record-compact.png` (generated reference)

---

## Verification

```bash
cd web && npm run test -- \
  tests/adminV2/viewModel/workUnitViewModelCompose.test.ts \
  tests/adminV2/workUnitQueueRowHeaderPresentation.test.ts \
  tests/adminV2/workUnitQueueRowRelatedDrawerIcons.test.tsx

cd web && npx tsc --noEmit
```

---

## Next steps (WU-VM-3+)

| Phase | Scope |
|-------|-------|
| **WU-VM-3** | Hard cutover first paint gate — see Phase 3 plan above |
| **WU-VM-4** | Queue pill model swap — see Phase 4 plan above |
| **WU-UX-3** | Facts band from configurable fields |

### Risks

- Row actions still post-bootstrap fetch on live path — VM models gap; cutover must embed in bootstrap
- Shadow diff uses `above_fold.header.sections` chip count (fixed `header_pills` typo in WU-VM-1)
- Baseline timings are dev-only until exported to perf dashboard
- KPI still background-deferred — first_paint contract marks KPI as deferred by design
- Session cache not yet read by page — safe foundation only
