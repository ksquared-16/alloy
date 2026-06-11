# BOS Identity System — Sprint 01

**Path:** `docs/sprints/06_2026/bos_identity_system_sprint01.md`  
**Status:** Complete — see Sprint 02 migration report  
**Follow-up:** `docs/sprints/06_2026/bos_identity_system_sprint02_migration_report.md`

## Objective

Establish reusable BOS visual primitives. No BOS functionality or backend changes.

## Doctrine

- BOS is Alloy's operational intelligence layer — not a separate product.
- Alloy logo unchanged; BOS identity = **Alloy Mark + Horizon + Smoke + Cloud Workspace**.
- Horizon is BOS-only; never part of the Alloy logo.
- Bend Pine `#00A283` for intelligence; no gold; no gradients on mark.

## Primitives

| Component | Path | Purpose |
|-----------|------|---------|
| `BosMark` | `web/app/adminV2/components/bos/identity/BosMark.tsx` | Alloy brandmark, pine fill, optional horizon |
| `BosHorizon` | `.../BosHorizon.tsx` | Thin foresight curve |
| `BosSmoke` | `.../BosSmoke.tsx` | CSS smoke — `thinking` / `converging` |
| `BosWorkingState` | `.../BosWorkingState.tsx` | Smoke → mark + message (no spinners) |
| `BosButton` | `.../BosButton.tsx` | Work with BOS CTA |
| `BosHeader` | `.../BosHeader.tsx` | BOS + Operational Intelligence |
| `BosNotification` | `.../BosNotification.tsx` | Insight-ready card |
| `BosWorkspaceShell` | `.../BosWorkspaceShell.tsx` | Cloud perimeter + header + content slot |

Barrel export: `web/app/adminV2/components/bos/identity/index.ts`  
Tokens: `web/lib/bos/bosIdentityTokens.ts`  
Motion CSS: `web/app/adminV2/components/bos/identity/bosIdentity.css`

## Initial usage (Sprint 01)

- Work with BOS: `BosDrawerAssistCta`, `QueueRowActionsMenu` → `BosMark`
- Action workspace: `ActionWorkspaceBosShell` → `BosHeader`; banner/success → `BosMark`
- Analysis: `ActionWorkspacePasteCanvas` → `BosWorkingState` while analyzing
- Comms V2: `ComposerBosEnhanceModal` → `BosHeader`
- Proposal cards: `OperationalProposalCardFrame` eyebrow → `BosMark`

## Not in scope

- Standard page/route loading (unchanged)
- Smoke on general navigation
- Replacing `BosGenieLampIcon` everywhere (legacy; migrate incrementally)
- `BosExecutionLoader` neural pulse (execution-specific; complements identity)

## Tests

```bash
cd web && npm run test -- tests/bos/bosIdentitySystem.test.ts
cd web && npm run test -- tests/admin/actions/actionWorkspaceFoundation.test.ts
cd web && npx tsc --noEmit
```

## Follow-ups

- Dev gallery at `/dev/bos-identity-system` (optional)
- Wire `BosNotification` into live insight surfaces
- Adopt `BosWorkspaceShell` on future BOS modals beyond action workspace
- Incrementally retire `BosGenieLampIcon` where `BosMark` is canonical
