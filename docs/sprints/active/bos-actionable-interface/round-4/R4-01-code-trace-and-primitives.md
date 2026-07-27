---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# R4-01 — Current-state code trace and exact primitive selection

## Objective

Inspect repository implementations and select exact Alloy primitives for Round 4 **before** product-code changes.

## Precedent surfaces inspected

Processing (`DigitalMailroomShell` / overview cards) · Communications · Work Items · Focus Panel identity / Current Work · Command Surface footer · BOS presentation controller · `ActionWorkspaceGatherFields` · Round 3 `BosCommandSessionHost`.

## Decisions (bound Round 4)

| Concern | Reuse | Do not |
|---|---|---|
| Layering | `WS_FIELD` stone body + `WorkspaceCard` (`WS_PROCESS_TILE_CHROME`) per section | Nested card-in-card; BOS-specific hex fills |
| Progressive sections | Host-local section open state; summaries via draft + gather fields (extend `createLeadUnderstandingPresentation`) | Second draft; hardcoded childcare field lists in shell |
| Inputs | `ActionWorkspaceGatherFields` + `SelectFieldControl` with new `chrome="quiet"` (drop `border-l-2` rails; quieter py/text) | New input framework; PasteCanvas hero |
| Help | Compact `[?]` + `ComposerFloatingPopover` + Escape/`role="dialog"` pattern from Current Work activity preview | Permanent Start Here card; new Tooltip package |
| Vocabulary | Operator noun **Lead** in all Create Lead copy | “Inquiry” as command noun |
| Sizing | Extend `BosPresentationController.setFloatingGeometry` with a **command-workspace width constant**; restore prior geo on complete/discard | Second sizing state machine; content-driven continuous resize |
| Density | Keep `resolveBosCommandSessionLayoutDensity` (pinned → compact) | Parallel density store |

## Stop risks assessed

| Risk | Verdict |
|---|---|
| New runtime / migration | Not required |
| Broad input redesign | Avoided — scoped `chrome` prop on existing gather fields |
| Second sizing machine | Avoided — geometry bump + restore via existing controller |
| Intake grouping ownership | Use effective gather `section` keys; presentation titles only |
| Parser / Processing change | Out of scope |

## Acceptance (R4-01)

- [x] Primitive reuse matrix written
- [x] Visual findings written
- [x] Section derivation contract drafted
- [x] Sizing contract drafted
- [x] Execution ledger created
- [x] No product code changed in this package

## Commit boundary

Docs only under `docs/sprints/active/bos-actionable-interface/round-4/` (+ ledger pointer in IMPLEMENTATION-LEDGER).

## Non-goals

Any host/CSS/input behavior change.
