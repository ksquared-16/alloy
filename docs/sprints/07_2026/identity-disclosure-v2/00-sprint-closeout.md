---
owner: operator
status: ready-for-staging-qa
last_reviewed: 2026-07-12
---

# Identity Disclosure V2 — Sprint Closeout

**Status:** READY FOR STAGING QA  
**Branch:** `hotfix/restore-identity-canvas-composer`  
**PR:** #180

## Summary

Restored the Identity Surface Builder canvas composer for Household and Children, then aligned **published Surface Builder configuration** with `/work-unit` runtime through a single canonical resolution path.

## Composer restoration (authenticated local QA — confirmed)

- Household editing fixed (Summary / Context Facts / Detail Fields / Evidence Collections)
- Children editing fixed (reference implementation preserved)
- Visual composition controls available (drag/drop, row pairing, widths)
- Household parent layout and Children layout authoring usable
- Compose routing unchanged — `Configure → composer UI`, `Preview → disclosure UI`

## Parity correction

### Root cause

1. **Publish path wiped operator layouts:** `reconcileNestedSurfaceConfig` always regenerated `fieldPlacements` via `generateDefaultIdentityFieldPlacements`, destroying Phone|Email row pairings and other authored layout at publish time.
2. **Publish/read asymmetry:** Publish used generic `reconcileNestedSurfaceConfig`; runtime load used `reconcileIdentityNestedConfigFromDocMetadata`.
3. **Legacy override:** `adaptChildSurfaceToChildrenSurface` and household contact adapter could let legacy keys override canonical published config when both were present.
4. **Household Builder preview bug:** `HouseholdCard` used `composer.enabled` (working copy) in Preview mode instead of `composingHouseholdSurface` gating like Children.

### Fix

- `serializeIdentityNestedSurfacesForPublish` — identity canonical publish serializer; strips legacy keys
- `resolvePublishedIdentitySurfaceConfigFromDoc` — single runtime/Builder-live resolver
- `reconcileNestedSurfaceConfig` preserves existing `fieldPlacements` when present
- Canonical `household_surface` / `children_surface` wins over legacy adapters
- `HouseholdCard` preview reads published doc when not composing
- Removed temporary deployment diagnostic banner

### Precedence

```
explicit canonical published group config → wins
legacy compatible published config → adapter input only when canonical absent
platform/default seed → fallback only when no explicit published config
```

`undefined` → fallback may apply; `[]` → explicitly empty.

## Automated proof

- `publishedIdentitySurfaceParity.test.ts` — publish round-trip, legacy precedence, explicit empty, Builder/runtime projector parity
- `identityBuilderRuntimeParity.test.ts` — tier layout parity through publish serializer
- Canvas composer regression suites remain green

## Manual acceptance (local authenticated QA)

Distinctive Household configuration (Phone|Email in Summary; Address in Details; DOB/Billing/Role not in Summary) publishes and renders on `/work-unit` with matching tiers, pairing, and section structure. Children Name/Age Summary + Program/Teacher Context Facts + Details/Evidence parity verified.

## Validation

```bash
cd web
npm run typecheck
npm run typecheck:tests
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

Focused parity + composer regression suites executed before push.

## Doctrine

Updated `docs/platform/operator/identity-surface-composition-v2.md` §11 (published config resolution). No competing doctrine document added.
