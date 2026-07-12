# BOS Identity — Final Reveal System

**Status:** Complete  
**Scope:** Motion integration only — identity primitives frozen.

## BosRevealSequence

Orchestrates the five motion stages:

1. **Complexity** — broad soft cloud (`BosSmoke` thinking)
2. **Condensing** — cloud narrows toward mark (`BosSmoke` converging)
3. **Reveal** — center clears; mark + horizon lockup appears
4. **Environment** — workspace mode only: perimeter emerges outward
5. **Complete** — smoke fades; BOS remains

### Props

| Prop | Type | Description |
|------|------|-------------|
| `mode` | `"working"` \| `"workspace"` | Working analyze flow vs full workspace open |
| `message` | `string?` | Copy below mark (working mode) |
| `onComplete` | `() => void?` | Fires after sequence completes |
| `autoPlay` | `boolean?` | Run full sequence once on mount (gallery / workspace open) |
| `active` | `boolean?` | Working mode: loop complexity/condensing while true |
| `fill` | `boolean?` | Fill parent container (workspace overlay) |

## Applied surfaces

### `mode="working"`

- `ActionWorkspacePasteCanvas` — analyze overlay
- `ActionIntakePastePanel` — parse overlay
- `BosReviewSummaryPlaceholder` — review summary loading

### `mode="workspace"`

- `ActionWorkspaceBosShell` — Create Lead / action workspace open (overlay presentation only; embedded skips reveal)
- `ComposerBosEnhanceModal` — BOS draft enhance modal open

## Explicitly not applied

- Route transitions (`AdminV2RouteLoadingState`)
- Drawer open overlays
- Standard page loading
- Button busy states
- Fake login splash / artificial delays

## Gallery

`/dev/bos-identity-system` frames:

- `reveal-working` — autoPlay + active loop examples
- `reveal-workspace` — replayable workspace reveal
- `applied` — production surface list

## Validation

```bash
cd web && npm run test -- tests/bos/bosIdentitySystem.test.ts tests/admin/actions/actionWorkspaceFoundation.test.ts
cd web && npx tsc --noEmit
cd web && npm run screenshots:bos-identity-system
```

## Suggested commit message

```
Add BosRevealSequence — cloud condenses into BOS on working and workspace open.

Wire working reveal to analyze/review surfaces; workspace reveal to action shell and composer modal. Identity frozen.
```
