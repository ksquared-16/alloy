# Lifecycle Builder — Guided Board + Prefetch + Scope Corrections

**Sprint:** June 2026  
**Status:** Shipped (UX/performance pass)

## Goal

Restore a single-surface guided configuration experience for the selected lifecycle stage, preload data once per stage selection, and clarify action scope vs placement without new engines or orchestration.

## Shipped

### Guided board layout

- `LifecycleStageGuidedBoard` replaces stacked detached sections in `LifecycleStageConfiguration`.
- **Row 1:** Required Information, Statuses, Work Unit Queue (3-column grid on `md+`).
- **Row 2:** Actions, Form coverage, Runtime Validation.
- Each card shows setup status, summary, body, and one primary **Save** action (no duplicate saves, no vague Continue links).
- After save, `confirmStep` scrolls/focuses the next card in order: required → statuses → queue → actions → forms → validation.

### Stage bootstrap prefetch

- `GET /api/admin/lifecycle-builder/stage-bootstrap?department_id=&stage_key=` returns one payload:
  - statuses, pipeline, field requirements palette, actions, forms coverage, linkable forms, base actions catalog.
- `useLifecycleStageBootstrap` caches by `departmentId:stageKey` so switching cards does not re-fetch per card.
- `LifecycleActivationBoard` applies bootstrap to statuses, pipeline, and configured actions list.
- Field requirements and forms cards accept bootstrap data (`skipInitialFetch` / `prefetchedFieldRequirements`) to avoid per-card loading spinners.

### Actions scope

- **Scope** field on Actions card: Lifecycle-level vs Stage-specific (default stage; `create_record` defaults lifecycle).
- Placements unchanged: department rail, work unit rail, queue row, drawer actions menu (default overflow for new actions).
- POST `/api/admin/enrollment-process/stage-actions` accepts `action_scope`; stored on `action_placements.condition_config`.
- Saved actions list stays visible; add form resets after save for another action.
- `loadEnrollmentStageActionsForOrg` shared by stage-actions GET and bootstrap.

### Forms coverage UX

- Card title **Form coverage** with copy: validate forms by intent against lifecycle required information; lifecycle does not own the form.
- Existing link mechanics retained.

### Field labels

- `resolveLifecycleFieldPaletteDisplayLabel` keeps catalog **Phone** when org `field_definitions` still use legacy **Mobile** for `phone` key.
- Custom org labels (e.g. Work Phone) still apply.

## Key files

| Area | Path |
|------|------|
| Guided UI | `web/components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx` |
| Wrapper | `web/components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx` |
| Board wiring | `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx` |
| Bootstrap API | `web/app/api/admin/lifecycle-builder/stage-bootstrap/route.ts` |
| Bootstrap builder | `web/lib/lifecycle/buildLifecycleStageBootstrap.ts` |
| Client cache | `web/lib/lifecycle/useLifecycleStageBootstrap.ts` |
| Action scope | `web/lib/lifecycle/lifecycleStageActionScope.ts` |
| Tests | `web/tests/lifecycle/lifecycleBuilderGuidedBoardPrefetch.test.ts` |

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleBuilderGuidedBoardPrefetch.test.ts
```

## Follow-ups (not in this pass)

- Full layout/action architecture doc for lifecycle-level vs stage-specific beyond placement `condition_config`.
- Server-driven “card complete” flags instead of client heuristics.
- Invalidate bootstrap cache on mutations outside the builder (e.g. Forms admin) via workspace bust events.
