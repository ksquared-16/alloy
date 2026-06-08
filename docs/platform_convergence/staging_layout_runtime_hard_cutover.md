# Staging Layout Runtime Hard Cutover

**Path:** `docs/platform_convergence/staging_layout_runtime_hard_cutover.md`  
**Status:** Staging-only — production flags remain off in code defaults

## Product model

```
Fields → Layout Config (/adminV2/settings/layouts) → Published LayoutDoc → Runtime Renderer → Drawer / Queue UI
```

## Vercel staging environment variables

### Required (master + per-entity)

```
LAYOUT_RUNTIME_ENABLED=1
NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=1

LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1
NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1

LAYOUT_RUNTIME_PERSON_DRAWER=1
NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER=1

LAYOUT_RUNTIME_CHILD_DRAWER=1
NEXT_PUBLIC_LAYOUT_RUNTIME_CHILD_DRAWER=1

LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1
NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1
```

Layout config UI (`LayoutConfigClient`) is enabled automatically when `LAYOUT_RUNTIME_ENABLED=1` — no separate `LAYOUT_V2_PREVIEW_ENABLED` required on staging.

### Emergency rollback (restores VM/legacy as primary)

```
LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1
NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1
```

Redeploy after setting. All drawer bodies and queue rows fall back to VM paths.

### Full kill switch

```
LAYOUT_RUNTIME_ENABLED=0
NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=0
```

## Surfaces

| Surface | Behavior when cutover on |
|---------|--------------------------|
| `/adminV2/settings/layouts` | Full Layout V2 builder — publish drives runtime |
| Opportunity drawer overview | LayoutDoc body (hold → layout, no VM flash) |
| Person drawer overview | LayoutDoc body |
| Child drawer overview | LayoutDoc body |
| Opportunity pipeline queue rows | LayoutDoc queue card |
| Waitlist candidate queue rows | Waitlist queue LayoutDoc variant |

## Fallback chain

1. Emergency legacy flag → VM everywhere
2. Master runtime off → VM everywhere
3. Per-entity flag off → VM for that entity only
4. Layout fetch timeout (1750ms) → VM body
5. Layout resolve/render failure → VM body (Error Boundary on render throw)

Shadow/proof parallel paths are **disabled** when visible body cutover is active for the same entity.

## Validation

```bash
cd web && npm run test -- \
  tests/layout/stagingLayoutRuntimeHardCutover.test.ts \
  tests/layout/opportunityDrawerLayoutRuntimeBody.test.tsx \
  tests/layout/layoutRuntimeFlags.test.ts \
  tests/layout/opportunityQueueLayoutRuntimeFoundation.test.ts \
  tests/adminV2/viewModel/opportunityDrawerVmRuntimeCompileGate.test.ts
```
