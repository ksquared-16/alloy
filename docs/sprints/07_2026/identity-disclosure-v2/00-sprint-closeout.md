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

## QA refinement closeout (Jul 2026)

- Tier-specific field policy ( per disclosure tier)
- Role-based Parent / Guardian configuration ( template)
- Configurable section labels ()
- Household section precedence / deduplicated contacts
- Third-width identity field rows
- Direct Context → Details identity drill
- Builder/runtime Focus Panel column stacking parity

**Status:** READY FOR FINAL QA (manual screenshots on Vercel preview)

## Final QA cleanup closeout (Jul 2026)

- Canonical Settings Fields picker (category-driven, focus_panel consumer)
- Composer stale-field fixes (explicit empty, no VM fallback)
- Configurable relationship section criteria + precedence
- Household → Children surface configuration handoff
- Opaque drill-in surface + scroll containment

**Status:** READY FOR FINAL MANUAL QA

## Focus Panel Builder Finalization (Jul 2026)

- Configurable relationship sections (label, criteria, visibility, order)
- Relationship section authoring UI in Builder inspector
- Runtime section projection wired (`householdRelationshipSectionsFromConfig`, `shouldShowRelationshipSection`)
- Canonical field consumption readiness documented
- Builder architecture doc: `docs/platform/operator/focus-panel-builder.md`

**Status:** BUILDER RELATIONSHIP-SECTION AUTHORING COMPLETE — pending manual QA + Canonical Field Convergence integration


### Prior overstatement corrected (Jul 13)

Editing metadata on fixed groups was not sufficient. Section definition/instance model, + Add section picker, criteria include/exclude editor, and migration from legacy groups are now implemented.

## Relationship-section UX cleanup (final Builder polish)

Separated collapsible section management from section-tab field authoring. Restored Parent/Guardian Add Field for Context Facts/Details. Optional section deletion (Additional Contacts) now sticks across reconcile. Elevated identity drill-in is fully opaque.

## Composer convergence

Removed duplicate field-layout editors. Summary/Context/Details use one green visual composer on the canvas; Context is explicitly configured; raw refs never render; elevated drill-in fully contains underlying cards.


## Product-shape correction (disclosure, containment, placement)

Locked: Context Facts stay a configuration purpose; runtime navigates
Summary → Collection → Details → Evidence with direct identity/section actions.
Elevated compose surfaces are fully opaque; field pickers are portaled and
collision-aware; Household summaries truncate sensibly with semantic avatar tokens;
Builder grid config and `/work-unit` share column/order/width/gap via the lanes
projection.


## Household edit + identity-resolved emergency contact

Person-level Edit only; authoritative seed/save-refresh. Add Emergency Contact uses intake
record resolution on one Alloy surface; legacy four-step wizard superseded for this action.


## Collection focus + published field parity

Collection drill-ins elevate centered. Parent/Guardian published tiers are authoritative;
address/DOB aliases normalize to canonical refs with no union of seeded defaults.
