---
owner: platform
status: runtime-v1-next-session-kickoff
last_reviewed: 2026-07-19
---

# Runtime V1 — Next Session Kickoff (paste this in)

> You know nothing except this document and the four companion docs in `docs/runtime/`. Read all five
> first: `runtime-consumer-completion-status.md`, `focus-panel-runtime-review.md`,
> `runtime-scalability-review.md`, `runtime-purification-review.md`, `runtime-browser-findings.md`,
> `runtime-v1-final-recommendation.md`.

## Mission

Continue **Runtime Consumer Completion**. The Runtime platform and architecture are ACCEPTED and frozen
— do NOT reopen them, do NOT redesign contracts, do NOT add new runtime abstractions. Use the existing
`FocusPanelWorkModeModel`, preparation pipeline, provisioning pipeline, commit model, and Settlement.
Your job is to finish the consumers so every operator-facing surface behaves as a prepared operational
destination.

## First actions

```bash
alloy-root                                   # MUST say managed-worktree / SANCTIONED
cd /Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion
git status                                   # MUST be clean
git log --oneline origin/staging..HEAD | head -12
# dev server (toolkit-owned; NEVER `npm run dev` directly — it loads no env):
alloy-dev-start wt3-runtime-drawer-deletion  # → http://localhost:3013
# typecheck (OOMs without heap bump; ignore transient .next/dev/types generated-file errors):
( cd web && pkill -9 -f tsserver; NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit )
```

**Certification auth gotcha:** the in-app Browser pane has its OWN cookie jar, isolated from the
operator's Chrome. Cold-frame cert did not run last session for this reason. Either have the operator
sign into the in-app pane, or drive their authenticated Chrome (claude-in-chrome). Do this early —
every consumer item needs browser cert.

## Remaining work (prioritized)

1. **Finish Focus Panel preparation completeness.** Promote Readiness (its first-operational content —
   Household/Children completeness — is now in `context.truth`) and any other knowable Summary card to
   ready-at-commit. Add **timing instrumentation** (destination commit → provisioning answer available
   → FocusPanelWorkModeModel available → each card ready → Settlement arrival). Cold-frame cert: the
   committed panel is meaningfully complete, no preview-plus-placeholders, no geometry shift, first
   action immediately available.
2. **Summary composition, not detailed commit presentation.** THE panel must initially present the
   published **Summary** composition, not the expanded detail. The runtime must honor the published
   Focus Panel Summary doc. Detail is Settlement enrichment. (See `focus-panel-runtime-review.md`
   §Product and `runtime-scalability-review.md` — moving to archetype + published-placement rendering
   is the enabling work, so a new published composition is honored with zero engineering.)
3. **Work View transition runtime.** New Leads / Active Pipeline / Registration / Waitlist / Tours must
   feel like attention movement, not navigation — no page reload, no significant remount, no Focus
   Panel flash. `ProvisionedWorkUnitSurface` keys the shell by work-unit target (verify no page reload,
   no flash in the browser).
4. **Activity runtime.** Prepared destination + atomic commit + retained geometry; Activity mode's
   commit-critical model prepared with the subject; Work↔Activity immediate, no network on a prepared
   subject, no remount.
5. **Communications runtime.** One canonical conversation surface (topic → thread → reply → compose in
   place) shared by the Communications Workspace and Focus Panel Activity. Delete the regressed/legacy
   Activity communications path.
6. **Processing runtime.** Inherit Destination → Preparation → Commit → Settlement.
7. **Work Items runtime.** Same.
8. **Operational Intelligence runtime.** Same.
9. **Runtime purification.** Delete superseded owners (see `runtime-purification-review.md`): the
   redundant late right-rail settlement fetch (after B cert), and — once archetype rendering lands —
   the hardcoded per-key model/renderer paths.
10. **Runtime certification.** Production-like browser cert across all consumers (Focus Panel cold/
    prepared/first/adjacent/Work↔Activity; Actions count-at-commit/applicability; Work View + Activity
    + workspace transitions; Communications). Record: acknowledgment, prepared hit/miss, atomic commit,
    requests-before-commit, blank/mixed frames, loading duration, remounts, geometry changes.
11. **Runtime test debt.** Repair/rewrite/DELETE every red runtime/focus-panel test to the FINAL
    contract (the suite is heavily pre-existing red + this session obsoleted several architecture-
    cutover assertions). A baseline-red suite is not freezable.
12. **Runtime freeze** — only when every item above is met and human QA passes.

## Non-negotiable product decisions (do not relitigate)

- **Runtime honors the published Focus Panel configuration.** Product owns composition.
- **Runtime is driven by card ARCHETYPES + published placement, not hardcoded per-card logic.**
- **Summary composition is the first committed operator experience.** Detail is Settlement enrichment.
- **Reserved geometry is acceptable. Blank white rectangles are NOT** — a reserved cell shows card
  identity + a preparing state.
- **Runtime owns preparation, provisioning, commit, and settlement. Product owns composition.**
- Changing the published configuration must NOT require engineering.

## Branch state

- **Branch:** `agent/claude/3-runtime-drawer-deletion` (managed Slot 3 worktree).
- **Latest commit:** `c3641cd6e` (reserved cells show identity, not blank).
- **89 ahead / 0 behind `origin/staging`. Not pushed. No PR. No merge. Tree clean.**
- **Commits created this session** (newest first): `c3641cd6e`, `b47c19ac3`, `e678f444a`, `881e4b6aa`,
  `6c3559e6c`, `62ac1002a`, `fa2ee0cc6`, `40a4f9afe`, `79e07f31a`, `20443d02b`. Plus the handoff docs
  commit.
- **Must know before continuing:**
  - Do NOT push/merge/PR/promote until the operator explicitly authorizes.
  - The Focus Panel input contract is `FocusPanelWorkModeModel` (source-agnostic). Both producers
    (`focusPanelWorkModeModelFromProvisioningAnswer` = commit-critical, `...FromDrawerVm` = enriched)
    feed the ONE grid `OpportunityFocusPanelModeGrid`. Do not reintroduce a drawer-VM read in a card.
  - The commit-critical card content is carried by the answer (`focusPanelStageWork` +
    `focusPanelSubjectSnapshot`) with NO new DB read — extend that pattern for more cards, don't fetch.
  - `OperationalContext` is the card contract; add commit-critical fields there / in the answer, keep it
    lean (not "DrawerVM V2"). Ask per field: "required for the first meaningful operator action?" If no
    → Settlement.
  - Typecheck baseline is 10 errors, all in pre-existing `tests/` files; ignore transient
    `.next/dev/types/*` generated-file parse errors from the live dev server.
