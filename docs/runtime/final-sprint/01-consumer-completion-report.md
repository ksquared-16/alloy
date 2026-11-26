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
| Activity — no-load-on-switch | **DONE** | The Communications panel visibly showed "Loading conversation…" because the idle prewarm warmed the *legacy* cache while the live panel reads the *V2* `drawerFamilyWorkspacePrefetchCache`. Fixed: the prewarm now warms the V2 workspace **and the first thread's messages** in the background (Work mode) so Activity opens warm. Browser-certified on a subject with conversations: `warmAttr=true`, no "Loading conversation…", first thread + messages on screen at once. Commit `b5206c361`. |
| Activity — as a formal runtime commit consumer | **PARTIAL** | The switch is now warm and does not remount, but Work→Activity is still local `useFocusPanelMode` state, not a K1→K2→K3 commit. Making it a commit is the remaining piece. |
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

## Workspace generalization — "they should all use the same runtime" (the plan)

Today each workspace warms and loads differently: the Focus Panel Work Unit is a true kernel consumer;
Activity uses `focusPanelActivityPrewarm` + the V2 family-workspace cache (now first-thread-warm); and
Processing / Work Items / OI / the Communications modal each mount+fetch behind their *own* warm cache
(`warmProcessingQueueCache`, OIP warm cache, `fetchWorkspaceOperationalTasks`, `CommandCenterShell`
conversations). That is four bespoke warm-and-load mechanisms.

The generalization target — one runtime pattern for every workspace:

1. **One prewarm registry.** Generalize `useFocusPanelModePrewarm` + `focusPanelActivityPrewarm` into a
   per-destination prewarm the shell arms for *any* attention target (work unit, Activity, Processing,
   Work Items, OI, Inbox), so the surface the operator is about to open is always warm — the same "warm
   in the background, never wait on switch" the Activity fix just proved for Communications.
2. **One settlement contract.** Each workspace's data hook (`useFamilyCommunicationRuntime`,
   processing queue, tasks, OIP) exposes the same `{ vm, servedFromWarmCache, loading, refresh }` shape
   so the shell can render warm-first + revalidate uniformly, instead of each surface inventing its own
   loading state.
3. **Modals become committed destinations.** Route `openWorkspaceModal(...)` through the kernel
   (Attention → Provisioning-equivalent → Commit) so a workspace open is a runtime commit with a
   prepared answer, not a mount+fetch — reusing the `ProvisionedWorkUnitSurface` hold/settle machinery.
4. **Delete the per-surface warm caches** once (1)–(2) land, collapsing four mechanisms into one (the
   Purification Report lists the flag-gated legacy this also unblocks).

The Activity Communications fix (commit `b5206c361`) is the first concrete instance of pattern (1): warm
the exact entries the consuming runtime reads, in the background, before the switch. Generalizing it to
all four modal workspaces is the bulk of task E and the honest remaining freeze work.
