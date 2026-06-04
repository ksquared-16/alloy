# Work Unit VM Cutover Sprint — WU-VM-0 / WU-VM-1 + Queue UX

**Path:** `docs/sprints/06_2026/work_unit_vm_cutover_sprint_wu0_wu1.md`  
**Status:** WU-VM-0 + WU-VM-1 + Track B header/people bands shipped (June 2026)  
**Audit:** `docs/audits/work_unit_runtime_cutover_audit.md`  
**UX baseline:** `docs/sprints/06_2026/work_unit_queue_ux_redesign_proposal.md`

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
  tests/adminV2/workUnitQueueRowRelatedDrawerIcons.test.tsx

cd web && npx tsc --noEmit
```

---

## Next steps (WU-VM-2+)

| Phase | Scope |
|-------|-------|
| **WU-VM-2** | Session VM cache (ownership key) |
| **WU-VM-3** | Hard cutover first paint gate |
| **WU-VM-4** | Queue pill model swap |
| **WU-UX-3** | Facts band from configurable fields |

### Risks

- Shadow diff uses `above_fold.header.sections` chip count (fixed `header_pills` typo in WU-VM-1)
- Baseline timings are dev-only until exported to perf dashboard
- KPI still background-deferred — first_paint contract marks KPI as deferred by design
