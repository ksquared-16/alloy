---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime Consumer Completion
---

# Runtime Consumer Completion Report — Final Sprint

Branch `agent/claude/3-runtime-drawer-deletion` (managed Slot 3, `wt3-runtime-drawer-deletion`, :3013).
All work local, committed, unpushed. Evidence is from the **authenticated in-app browser** against the
live dev server (Firefly Early Learning org), not from reasoning.

## Consumer status at a glance

| Consumer | Verdict | Evidence |
|---|---|---|
| Focus Panel — Summary composition | **DONE** | Commits the published Summary composition (`docSource: published-doc`), summary-level cards, no settlement pop-in. Browser-certified. |
| Focus Panel — commit chain / preparation completeness | **DONE** | current_work + household + children + readiness ready at commit; model +50ms, settlement +137ms (warm). Instrumented + measured. |
| Work Unit Actions | **DONE (server) / certified** | Answer carries the actions projection at commit; count stable, no zero-flash. |
| Work View switch (New Leads / Active Pipeline / Registration / Waitlist / Tours) | **DONE** | Now attention movement, not navigation: no shell/queue/focus-panel remount, no boot-shell flash, in-place re-commit. Browser-certified. |
| Activity | **PARTIAL** | Runtime-committed host + commit seed + idle prewarm + no remount on switch, but the Work→Activity switch is local mode state (not a runtime commit) and the cockpit resolves comms/documents via component-local fetch. |
| Communications | **PARTIAL (already unified view)** | The canonical Inbox and the Activity comms panel are the **same** view (`FamilyCommunicationWorkspaceView` + `useFamilyCommunicationRuntime`, differentiated only by `surfaceVariant`). Interaction model (Topic→Thread→Reply→Compose-in-place) is shared. Still a modal mount+fetch, not a runtime consumer, and flag-gated legacy wrappers remain. |
| Processing | **LEGACY** | `processing` workspace modal, mount+fetch (5 fetches on open: `/processing/queue`, `/forms`×4). Not a runtime consumer. |
| Work Items | **LEGACY** | `tasks` workspace modal, mount+fetch (8 fetches on open). Not a runtime consumer. |
| Operational Intelligence / Analytics | **LEGACY** | `analytics` workspace modal, mount+fetch (metrics/resolve + intelligence/operational + trends). Not a runtime consumer. |

## Completed and certified this sprint

- **B — Focus Panel Summary is the first operational experience.** The committed Current Work card
  was rendering its full workspace inline (MoreActions/OtherTransitions/recent-Activity — all
  settlement-derived, popping in ~1 tick after commit). Trimmed to the operational summary (status,
  progress, requirements readiness, primary + record-outcome + `Open workspace →`); the full detail
  remains one click away in the drill-in workspace (`presentation="workspace"`). Card height 439→362px,
  no settlement pop-in. Commit `4667968f4`. Browser-certified: `mode=summary`, `docSource=published-doc`,
  `hasMoreActions=false`.
- **C — Work View switch is attention movement.** A lens switch (`target::lensA → target::lensB`) was
  unmounting the whole `ProvisionedWorkUnitSurface` to a boot shell and remounting (shell/queue/panel
  remount + flash), because `showWorkUnit` required `committedMatchesDesired`. Now a same-target lens
  exchange HOLDS the committed surface and swaps in place at the atomic commit. Commit `4667968f4`.
  Browser-certified: shell DOM node **identical** across the switch, **no** boot-shell flash, pills
  persist, in-place re-commit (commitVersion increments), **0px** geometry shift on subject switch.
- **Preparation completeness + timing + published composition + declared card registry** (prior
  session, re-certified live): Readiness ready-at-commit, the `focus_panel_chain:*` marks, the
  provisioning answer carrying the published Summary doc (`fps:` config-cached + publish/rollback/
  delete invalidation), and the commit-critical card registry.

## Remaining consumer work (blockers — see the Freeze Recommendation)

- **D — Activity as a formal runtime consumer.** Make Work→Activity a runtime commit (prepared
  destination → atomic commit → settlement) rather than local `useFocusPanelMode` state + cockpit
  mount+fetch. The seams already exist (commit seed `communicationsPreview`, `focusPanelActivityPrewarm`),
  so this is finishing, not new architecture.
- **E — Processing / Work Items / Operational Intelligence inherit Runtime.** All three are
  `openWorkspaceModal(...)` modals that load mount→effect→fetch behind warm caches. None touch
  attention/provisioning/commit/settlement. Converting each to a runtime consumer is the bulk of the
  remaining work.
- **F — Communications.** The canonical VIEW is already unified; what remains is retiring the
  flag-gated legacy wrappers (see the Purification Report) and, if Communications is to be a runtime
  consumer, giving the workspace modal a preparation/commit lifecycle.
