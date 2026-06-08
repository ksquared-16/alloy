# Staging Layout Runtime Hard Cutover

**Path:** `docs/platform_convergence/staging_layout_runtime_hard_cutover.md`  
**Status:** Staging defaults ON — no manual Vercel layout flags required

## Product model

```
Fields → Layout Config (/adminV2/settings/layouts) → Published LayoutDoc → Runtime Renderer → Drawer / Queue UI
```

## Staging default-on (no manual env vars)

Layout runtime is **enabled by default** when:

| Signal | Where |
|--------|--------|
| `NEXT_PUBLIC_APP_ENV=staging` | Client + server (set on Vercel staging deploys) |
| `VERCEL_ENV=preview` | Server-only fallback for non-production branch deploys |

All cutover surfaces default on under staging:

- Layout Config builder (`/adminV2/settings/layouts`)
- Opportunity / Person / Child drawer bodies
- Lead Management pipeline queue rows
- Waitlist candidate queue rows

**Production remains default-off** when `NEXT_PUBLIC_APP_ENV=production` and `VERCEL_ENV=production`.

Implementation: `web/lib/layout/layoutRuntimeEnvironment.ts` + `web/lib/layout/featureFlag.ts`.

## Emergency rollback (restores VM/legacy as primary)

```
LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1
NEXT_PUBLIC_LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1
```

Redeploy after setting. All drawer bodies and queue rows fall back to VM paths.

## Optional explicit overrides on staging

Disable entire cutover:

```
LAYOUT_RUNTIME_ENABLED=0
NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=0
```

Disable a single entity:

```
LAYOUT_RUNTIME_PERSON_DRAWER=0
NEXT_PUBLIC_LAYOUT_RUNTIME_PERSON_DRAWER=0
```

## Surfaces

| Surface | Staging behavior |
|---------|------------------|
| `/adminV2/settings/layouts` | LayoutConfigClient primary — publish drives runtime |
| Opportunity drawer overview | LayoutDoc body (hold → layout, no VM flash) |
| Person drawer overview | LayoutDoc body |
| Child drawer overview | LayoutDoc body |
| Pipeline queue rows | LayoutDoc queue card + Error Boundary → VM row |
| Waitlist queue rows | Waitlist LayoutDoc variant + Error Boundary → VM row |

## Fallback chain

1. Emergency legacy flag → VM everywhere
2. Explicit `LAYOUT_RUNTIME_ENABLED=0` → VM everywhere
3. Per-entity flag `=0` → VM for that entity only
4. Layout fetch timeout (1750ms) → VM body
5. Layout resolve failure → VM body
6. Render throw → Error Boundary → VM body / VM queue row

Shadow/proof parallel paths are **disabled** when visible cutover is active.

## Validation

```bash
cd web && npm run test -- \
  tests/layout/stagingLayoutRuntimeHardCutover.test.ts \
  tests/layout/layoutRuntimeFlags.test.ts \
  tests/layout/layoutRuntimeQueueRowErrorBoundary.test.tsx \
  tests/layout/opportunityDrawerLayoutRuntimeBody.test.tsx \
  tests/layout/opportunityQueueLayoutRuntimeFoundation.test.ts \
  tests/adminV2/viewModel/opportunityDrawerVmRuntimeCompileGate.test.ts
```
