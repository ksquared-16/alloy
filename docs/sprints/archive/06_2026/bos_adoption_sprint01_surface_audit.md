# BOS Adoption Sprint 01 — Surface Audit

**Status:** Complete  
**Doctrine:** **`docs/system/bos-identity-doctrine.md`** (frozen)

Classification key: **1** compliant · **2** needs BosMark · **3** needs BosHeader · **4** needs BosRevealSequence · **5** needs BosWorkspaceShell · **6** should NOT use BOS identity

---

## Action Workspace

| Surface | Class | Notes |
|---------|-------|-------|
| `ActionWorkspaceBosShell` | 1 + 4 + 3 | Workspace reveal on overlay open; `BosHeader` territory; `bos-workspace-shell` perimeter |
| `ActionWorkspacePasteCanvas` | 1 + 4 | Working reveal on analyze; `BosButton` primary CTA (Adoption 01) |
| `ActionWorkspaceBosBanner` | 1 | Mark + horizon lockup, no badge container |
| `ActionWorkspaceSuccessState` | 1 | Mark + horizon on success |
| `ActionWorkspaceExecuteState` | 6 | Uses `BosExecutionLoader` (execution, not identity smoke) — correct |
| `CreateLeadModal` | 1 | Routes through `ActionWorkspaceBosShell` |

---

## Communications V2

| Surface | Class | Notes |
|---------|-------|-------|
| `ComposerBosEnhanceModal` | 1 + 4 + 5 + 3 | Workspace reveal → `BosWorkspaceShell` + `BosHeader` |
| `ComposerReplyActionCluster` | 1 | `BosButton` secondary for BOS Assist (Adoption 01) |
| `DrawerMessagingComposer` / `InboxThreadReplyBox` | 1 | Opens enhance modal (workspace reveal) |
| Comms send / channel toggles | 6 | Standard UI chrome — no BOS identity |

---

## Forms Review

| Surface | Class | Notes |
|---------|-------|-------|
| `BosReviewSummaryPlaceholder` | 1 + 3 + 4 | `BosHeader` + working reveal while summary loads |

---

## Command Center rail

| Surface | Class | Notes |
|---------|-------|-------|
| `BosRailPresentation` (`BosRailHeader`) | 1 + 3 | `BosHeader` sm; starter cards use mark + horizon |
| `AICommandSurfaceShell` | 1 | Persistent rail — no workspace reveal (rail always visible) |
| Command surface thread / cards | 6 | Operational proposal frames — not identity smoke |

---

## Recommendation / proposal cards

| Surface | Class | Notes |
|---------|-------|-------|
| `OperationalProposalCardFrame` | 1 | Inline mark + horizon eyebrow |
| `JobLayoutOperationalProposalCard` | 6 | Uses operational frame, not identity reveal |

---

## Create Lead / Intake

| Surface | Class | Notes |
|---------|-------|-------|
| `ActionIntakePastePanel` | 1 + 4 | Working reveal on parse; `BosButton` primary (Adoption 01) |
| `BosDrawerAssistCta` | 1 | Mark + horizon on default variant; white mark on juniper |

---

## Entry points

| Surface | Class | Notes |
|---------|-------|-------|
| `QueueRowActionsMenu` | 2* | Drawer action rail — `RecordDrawerHeaderActionButton` + white mark. **Skipped BosButton** — drawer rail sizing contract |
| `ProofRecordModal` | 2* | Proof-only simulated button. **Skipped BosButton** — legacy blue proof styling |
| `QueueRowActionsMenu` / drawer CTAs | 6 | Not workspace reveal targets |

---

## Deprecated / dev-only

| Surface | Class | Notes |
|---------|-------|-------|
| `BosGenieLampIcon` | 6 | Deprecated — wraps `BosMark`; no production imports |
| `ActionWorkspaceBosCloudShell` | 6 | Dev exploration only |
| `bos-identity-exploration` / mockups | 6 | Dev galleries — not production |

---

## Loading surfaces (no identity smoke)

| Surface | Class | Notes |
|---------|-------|-------|
| `AdminV2RouteLoadingState` | 6 | `BosExecutionLoader` — correct |
| `AdminV2DrawerLoadingState` | 6 | `BosExecutionLoader` — correct |
| `OpportunityDrawerOpeningOverlay` | 6 | Execution loader — correct |
| `BosExecutionLoader` modals | 6 | Action execution — correct |

---

## Adoption Sprint 01 changes applied

1. Doctrine doc + doc links
2. `BosButton` on paste analyze, intake parse, composer BOS Assist
3. Tests: `web/tests/bos/bosAdoptionSprint01.test.ts`
4. Gallery applied-examples frame updated

## Skipped (documented)

- **ProofRecordModal** — proof shell blue styling; disabled simulated control
- **QueueRowActionsMenu** — drawer header action rail geometry
- **Command Center rail open** — no discrete open moment; rail is persistent

---

## Success check

No competing BOS visual systems in production paths audited above. Identity primitives unchanged; adoption only.
