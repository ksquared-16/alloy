# Lifecycle Builder — Actions Model Simplification + Scrollable Cards

**Sprint:** June 2026  
**Status:** Shipped

## Goals

1. Consistent guided-board card heights with internal scroll (footer pinned where shown).
2. Actions model: runtime surfaces + preflight — not “22 stage setup actions.”
3. Only **explicitly configured** actions in the list; base actions stay in the dropdown only.

## Ownership model

| Scope | Meaning | Examples |
|--------|---------|----------|
| **Lifecycle-wide** | Available across the lifecycle | Create Lead, Update Status, Create Task |
| **Stage-specific** | Limited to selected operator stages | Send Form on Lead; Schedule Tour on Tour |

Placements (independent of scope): Department rail, Work Unit rail, Work Unit row, Drawer Actions menu.

Stored on `action_placements.condition_config`:

- `lifecycle_builder_configured: true`
- `lifecycle_action_scope`: `lifecycle` | `stage`
- `lifecycle_operator_stages`: string[] (stage-specific; legacy `lifecycle_operator_stage` still read)

## UI

- **Configured actions** — only rows from builder saves (no catalog-inferred list).
- **Add action** — base action, display label, scope radios, stage checkboxes when stage-specific, placements, **Save Action** (no card-footer save on Actions card).
- New lifecycle: configured list starts **empty**.

## Card layout

- All guided cards: `380px` height, `lifecycle-guided-card-body` scrolls, `items-stretch` grid rows.
- Actions card: `hideFooter` — save lives on Add Action form only.

## Key files

| Area | Path |
|------|------|
| Configured loader | `web/lib/lifecycle/loadLifecycleBuilderConfiguredActions.ts` |
| Row builder | `web/lib/lifecycle/lifecycleConfiguredActionRows.ts` |
| Scope helpers | `web/lib/lifecycle/lifecycleStageActionScope.ts` |
| Actions UI | `web/components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx` |
| Guided board | `web/components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx` |
| POST | `web/app/api/admin/enrollment-process/stage-actions/route.ts` |

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleActionsModelSimplification.test.ts tests/lifecycle/lifecycleBuilderGuidedBoardPrefetch.test.ts
```

## Follow-ups

- Edit configured action in place (today: remove + re-add).
- Optional starter template for new lifecycles (explicit opt-in only).
- Message base action in curated dropdown when product defines `definition_key`.
