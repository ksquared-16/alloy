# Workspace Atmosphere — Premium Pine Gradient (Locked)

**Status:** Locked shipping profile (June 2026)  
**Scope:** Global AdminV2 workspace shell — **not** Communications-specific.

## Shipping profile

**Premium pine gradient** — ~80% Bend Pine / ~20% Midnight Forge:

- Flat band ~4.5%
- Radial peak ~6.5% at `56% 42%`
- Full bleed through BOS rail column

Minimal and strong variants were evaluated during the pass; premium selected for production.

## Doctrine

`docs/system/workspace-atmosphere-doctrine.md`

## Validation

```bash
cd web && npm run test -- tests/adminV2/drawerShellOverlayDoctrine.test.ts tests/adminV2/workspaceAtmosphereDoctrine.test.ts
```
