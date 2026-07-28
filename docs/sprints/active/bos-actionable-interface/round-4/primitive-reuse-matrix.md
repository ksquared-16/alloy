---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# Round 4 — Primitive reuse matrix

Every UI decision must map to a row below.

| Concern | Primitive | Path | Precedent |
|---|---|---|---|
| Command body field wash | `WS_FIELD` (`bg-alloy-stone/[0.07]`) | `web/components/workspace/workspaceTokens.ts` | Processing / Communications canvas |
| White operational card | `WorkspaceCard` → `WS_PROCESS_TILE_CHROME` | `web/components/workspace/WorkspaceCard.tsx` | Processing overview tiles |
| Section eyebrow | `WS_EYEBROW` | `workspaceTokens.ts` | Workspace module landings |
| Primary / secondary actions | `WS_ACTION_PRIMARY` / `WS_ACTION_SECONDARY` | `workspaceTokens.ts` | Command footer (R3) |
| Quiet input chrome | `WS_FIELD_SEARCH_CHROME` / `WS_FIELD_SELECT_CHROME` (or ActionIntake-scale) | `workspaceTokens.ts` · `ActionIntakeFieldGroups.tsx` | Processing Alloy controls |
| Gather field ownership | `ActionWorkspaceGatherFields` + `SelectFieldControl` | `web/components/admin/actions/` · `web/components/admin/fields/` | Create Lead Form (keep) |
| Display-first edit | Focus Panel `IdentityFieldValue` / task popover summary→edit | `web/components/admin/focusPanel/identity/` · `OperationalTaskDetailPopover.tsx` | Intentional edit |
| Progressive optional band | `TechnicalDetailDisclosure` (pattern only) | `web/components/forms/review/` | Optional disclosure |
| Help popover shell | `ComposerFloatingPopover` | `web/components/admin/focusPanel/drillIn/ComposerFloatingPopover.tsx` | Current Work / nested surface |
| Help a11y (Escape, dialog, focus) | Pattern from `CurrentWorkActivityPreview` / `QueueRecordAttentionPopover` | focusPanel cards · queueRecord | Accessible popovers |
| Density | `resolveBosCommandSessionLayoutDensity` | `web/lib/bos/commandSession/commandSessionLayout.ts` | R2/R3 |
| Presentation owner | `BosPresentationController` | `web/contexts/BosPresentationControllerContext.tsx` | AdminV2 BOS rail |
| Floating geometry | `setFloatingGeometry` / `bosFloatingGeometry` | `web/lib/bos/bosFloatingGeometry.ts` | Adaptive workspace |
| Understanding groups | `createLeadUnderstandingPresentation` | `web/lib/bos/commandSession/` | R3 conversation/review |
| Footer anatomy | Host sticky footer (align with Command Surface stage labels) | `BosCommandSessionHost.tsx` · `CommandSurfaceShell.tsx` | Command continuity |

## Explicitly rejected

| Candidate | Why |
|---|---|
| Full `WorkspaceShell` inside BOS | BOS already owns white/Bend Pine chrome; nest shell would double chrome |
| `ActionWorkspacePasteCanvas` | Reintroduces inquiry-hero language |
| New Tooltip / Radix dependency | No platform Tooltip in tree; reuse ComposerFloatingPopover |
| Second presentation preferred enum | Duplicates sizing ownership |
| Hardcoded Family/Child field keys in host | Must follow effective intake `section` |
