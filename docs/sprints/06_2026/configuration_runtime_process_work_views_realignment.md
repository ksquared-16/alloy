# Configuration Runtime — Process-Level Work Views Realignment

**Status:** **Paused** — superseded for planning by [configuration_runtime_processes_layouts_alignment.md](./configuration_runtime_processes_layouts_alignment.md)

Exploratory branch work (process nav, `work_views_v1` draft API) may be reused after alignment approval — **do not treat as shippable UX**.

---

## Why stage-level Work Views were rejected

The approved Concept A mockups treat **Work Views as process-level operational lenses**, not stage sections.

Examples that span stages:

- Tours Today
- Needs Follow-up
- Missing Paperwork
- Starting Soon
- Waitlist
- Hot Leads

Stage-scoped `perspectives_v1` was a compatibility projection tied to synced queue lanes. It could not express cross-stage filters or the mockup’s editable **Show work when…** condition builder.

**Decision:** Move primary Work Views authoring to process level. Stage `perspectives_v1` remains compatibility metadata for runtime convergence until migration.

---

## Target architecture

```
Business Process
├── Stages          → status membership, requirements, operating plan, readiness
├── Work Views      → name, mission, filters, sort, visibility, presentation, preview
├── Presentation    → stage layout assignments (queue + focus panel)
├── Actions         → process actions matrix
├── Automation      → placeholder
└── Health          → ready check / BOS recommendations (placeholder)
```

### Work Views own

- Operators see (label)
- Purpose / mission
- Show work when… (`filters_v1`)
- Default sort (`sort_v1`)
- Visibility + display order
- Queue / Focus Panel layout assignment
- Preview runtime (compatibility queue when mapped)
- Advanced → technical identity (collapsed)

### Stages own

- Status membership
- Required information
- Operating plan
- Stage readiness (health tab)

---

## Implementation choice: Option B (metadata)

Added **`work_views_v1`** on `lifecycle_builder_v1.processes[]` — no database migration.

| Path | Role |
|------|------|
| `processes[].work_views_v1` | Primary authoring surface (new) |
| `processes[].stages[].perspectives_v1` | Runtime compatibility layer (unchanged) |

**Tradeoff:** Dual metadata until runtime reads `work_views_v1`. UI seeds from stage perspectives when process views are unsaved (`workViewsCompatibility.ts`).

**API:** `GET/POST /api/admin/lifecycle-builder/process-work-views`

---

## Runtime compatibility plan

| Layer | Current | Next phase |
|-------|---------|------------|
| Settings UI | Authors `work_views_v1` | — |
| Runtime convergence | Reads stage `perspectives_v1` | Map `work_views_v1` → runtime pills/navigation |
| Preview runtime | Uses `compat_queue_key` when seeded from legacy perspectives | Process-level preview without queue keys |

**No runtime changes in this pass** — configuration model correction only.

---

## UI structure (implemented)

1. Process selector cards (compact strip while configuring)
2. Process-level navigation cards: Stages · Work Views · Presentation · Actions · Automation · Health
3. **Work Views workspace** — list + editor with editable condition rows, sort, layout selectors, visibility/order
4. **Stage workspace** — Work Views and Presentation removed from stage card stack
5. Full-width canvas; configuration sidebar hidden on Business Processes

---

## Screenshots

Directory: [configuration-runtime-process-work-views/](./configuration-runtime-process-work-views/)

| File | Shows |
|------|-------|
| `process-level-nav.png` | Process cards + section navigation |
| `work-views-workspace.png` | Process-level Work Views list + editor |
| `work-view-condition-editor.png` | Editable Show work when… rows |
| `stage-workspace-no-work-views.png` | Stage cards without Work Views section |
| `full-page-bos-rail.png` | Full page with BOS rail |

Run: `npx playwright test playwright/tests/configuration-runtime-process-work-views.spec.ts`

---

## Remaining gaps vs green mockups

| Gap | Status |
|-----|--------|
| Rich wireframe presentation thumbnails | CSS placeholders — EB preview API not wired |
| Automation workspace | Placeholder card |
| BOS configuration health recommendations | Health tab uses ready check only |
| Runtime consumes `work_views_v1` | Follow-up migration |
| Filter field catalog from org config | Static v1 field list |

---

## Validation

```bash
cd web && npm run test -- \
  tests/adminV2/configurationRuntimeConceptA.test.ts \
  tests/lifecycle/workViewsConfigV1.test.ts

cd web && npx playwright test playwright/tests/configuration-runtime-process-work-views.spec.ts
```

---

## Key files

- `web/lib/lifecycle/workViewsConfigV1.ts`
- `web/lib/lifecycle/workViewsCompatibility.ts`
- `web/lib/lifecycle/persistWorkViewsV1.ts`
- `web/app/api/admin/lifecycle-builder/process-work-views/route.ts`
- `web/components/adminV2/settings/businessProcess/*`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx`
