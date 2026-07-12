# BOS Identity System — Sprint 03 Refinement

**Status:** Complete (visual refinement)  
**Doctrine:** Locked — no new BOS concepts, colors, icons, or loading systems.

## Objective

Raise visual execution quality across canonical BOS identity primitives without redesigning the system. After screenshot review and minor follow-up tweaks, BOS identity should be considered **frozen**; product focus shifts to Communications V2, Forms V2, and Action Workspace adoption.

## What changed

### P1 — BosMark + horizon treatment

- `BosHorizon` now renders **primary foresight curve** + **secondary atmospheric wave** (lighter weight, lower opacity).
- `BosMark` with `horizon` prop stacks official Alloy mark geometry above the horizon stack — canonical lockup.
- Applied on headers, notifications, working states, secondary buttons, workspace shell header, and production banners/rails.

### P2 — Smoke visibility

- Four smoke layers (was three) with higher base opacity and contrast.
- **Thinking:** upward drift + subtle breathe — reads as information gathering.
- **Converging:** layers narrow toward center — clarity emerging toward the mark.
- Still premium; not fog, not SFX.

### P3 — Dark logo containers removed

Removed mint rounded-square / halo treatments around the mark in:

- `BosHeader`
- `BosNotification`
- `ActionWorkspaceBosBanner`
- `ActionWorkspaceSuccessState`
- `BosRailPresentation` starter cards

Standalone mark + horizon on white surfaces with clean spacing.

### P4 — Workspace shell

- Perimeter uses soft radial gradients + minimal inset hairline — **discovered atmosphere**, not illustrated cloud border.
- Removed redundant standalone horizon line in shell header (header lockup carries horizon).

### P5 — Header audit

- Consistent gap (`gap-3.5`), mark offset (`pt-0.5`).
- Mark sizing stepped down vs title — distant focal point, not logo lockup badge:
  - `sm` header → `sm` mark
  - `md` header → `sm` mark
  - `lg` header → `md` mark

### P6 — Gallery + screenshots

Gallery updated at `/dev/bos-identity-system` with Sprint 03 labels and canonical lockup callout.

Screenshot capture:

```bash
cd web && npx playwright install chromium   # if browsers missing
cd web && npm run screenshots:bos-identity-system
```

Output: `docs/sprints/06_2026/assets/bos-identity-system/*.png`

## Files touched

| Area | Files |
|------|-------|
| Primitives | `BosHorizon.tsx`, `BosMark.tsx`, `BosSmoke.tsx`, `BosWorkingState.tsx`, `BosButton.tsx`, `BosHeader.tsx`, `BosNotification.tsx`, `BosWorkspaceShell.tsx`, `bosIdentity.css` |
| Tokens | `web/lib/bos/bosIdentityTokens.ts` |
| Production | `ActionWorkspaceBosBanner.tsx`, `ActionWorkspaceSuccessState.tsx`, `BosRailPresentation.tsx`, `OperationalProposalCardFrame.tsx`, `BosDrawerAssistCta.tsx` |
| Gallery / tests | `BosIdentitySystemGallery.tsx`, `tests/bos/bosIdentitySystem.test.ts` |

## Remaining visual inconsistencies (post-Sprint 03)

These are intentional or out of scope for identity freeze; note for manual screenshot review:

1. **Primary CTAs** (juniper buttons) still use **white mark only** — no horizon in tight button chrome. Secondary/outline CTAs use full lockup.
2. **`ComposerReplyActionCluster`** — compact inline BOS action uses white mark on filled button; not migrated to `BosButton`.
3. **`ProofRecordModal`** — custom button markup with mark-only icon.
4. **`BosExecutionLoader`** — step indicators use numbered circles, not BosMark; execution loading is separate from identity smoke.
5. **Dev mockups** (`action-workspace-v2-mockups`) — may still show pre-Sprint 03 patterns; not production surfaces.
6. **Dark forge demo block** in gallery header frame — dark *surface* for `onDark` header is intentional; mark has no badge container.

## Smoke direction correction (final)

Reverted stream/lane/pipeline motion. Smoke is **emotional** — a soft cloud of possibility condensing toward clarity. The mark remains structural.

- **Thinking:** four stacked cloud lobes — wide footprint, soft radial edges, gentle breathe (unresolved, gathering).
- **Converging:** same cloud mass pulls inward and downward toward the focal point above the mark (understanding emerging).
- **Complete:** unchanged — smoke fades, mark remains.

Explicitly not: intake channels, merge streams, converging lanes, or process-graphic motion.

## Explicitly not done (per doctrine)

- No spinning or pulsing Alloy mark
- No new icons, logos, colors, or loading systems
- No backend changes

## Validation

```bash
cd web && npm run test -- tests/bos/bosIdentitySystem.test.ts
cd web && npx tsc --noEmit
```

## Suggested commit message

```
Refine BOS identity visuals for Sprint 03 — horizon wave, smoke, shell atmosphere.

Remove dark logo containers; align headers and production surfaces with canonical mark+horizon lockup. Update identity gallery and tests.
```
