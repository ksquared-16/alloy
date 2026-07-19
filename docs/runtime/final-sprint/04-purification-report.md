---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime Purification
---

# Runtime Purification Report — Final Sprint

## Deleted this sprint

- **`MoreActionsLauncher`, `OtherTransitionsDisclosure`, `ActivityFooter`** (~160 lines) in
  `components/admin/focusPanel/cards/CurrentWorkCard.tsx` — orphaned when the Current Work summary was
  trimmed to summary-level (B). Their behavior lives in the drill-in workspace (`CurrentWorkWorkspace`).
  Plus the now-unused `ViewInWorkItemsLink` import. Commit `d8325011f`. Browser-verified no regression
  after a clean dev-server restart.

## Verified-legacy deletion candidates (NOT deleted — flag-gated; need product sign-off)

These are real duplication, but each is gated behind a feature flag whose permanence is a **product
decision**. Deleting a flag-off branch is only safe once the flag is permanently on. Do not delete
blind.

| Candidate | File | Gate | Notes |
|---|---|---|---|
| Deprecated Activity workspace shim | `components/admin/focusPanel/OpportunityFocusPanelActivityWorkspace.tsx` | none (dead re-export) | 5-line `@deprecated` re-export of `OpportunityFocusPanelEmbeddedWorkspace`. Safe once the old import name is confirmed unused. |
| Deprecated Communications route | `app/adminV2/communications/page.tsx` | none (unlinked) | Standalone hub route, "intentionally not linked from nav." Dead route. |
| Legacy comms drawer implementation | `components/admin/communications/CommunicationsDrawerSection.tsx` (~lines 330–1354, flag-off branch) | `comms_v2_record_tab` | ~1000-line second communications implementation; when the flag is on it delegates to the canonical `RecordCommunicationsTab`. Biggest single purification target. |
| Legacy inbox panel | `app/adminV2/messages/InboxPanel` (via `InboxModal.tsx:93–105`) | `comms_v2_command_center` | Superseded by `CommandCenterShell`. |
| Legacy record-comms model branch | `RecordCommunicationsTab.tsx:53–70` (`buildRecordCommunicationsModel`) | `comms_v2_live_workspace` | Dead once the flag is permanent. |

## Deferred / documented (already noted by prior sessions, still valid)

- **The redundant late right-rail settlement fetch** in `useWorkUnitSettlement` — kept behind the
  answer's `actionsProjection` (merge guard prevents a clobber). Remove once Actions is fully
  browser-certified against a publish that changes the action set.
- **`OpportunityFocusPanelModeBody`** — still used by the modal drawer runtime; retire when the modal
  drawer is migrated/retired.
- **`.next-prodcert` scaffolding + `ALLOY_PROD_CERT_DIST` gate** — cert scaffolding; keep for prod cert,
  remove after freeze if desired.
- **Per-key card model/renderer hardcoding** — superseded by the archetype-driven rewrite (see the
  Scalability Certification); delete the per-key `buildCardModels` blocks + `FocusPanelCardRenderer`
  switch once archetype rendering lands.

## Purification principle applied

"Leave one Runtime, not two" is satisfied at the **canonical view** level for the Focus Panel (one
`FocusPanelWorkModeModel`, one grid, one body) and for Communications (one
`FamilyCommunicationWorkspaceView` reached via `surfaceVariant`). The remaining "two runtimes" are the
**flag-gated legacy wrappers** above — their deletion is blocked on the feature flags being made
permanent, which is a product call, not an engineering one.
