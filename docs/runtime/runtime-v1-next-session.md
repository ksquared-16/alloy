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

> Session 2026-07-19b DELIVERED former items 1–2's engineering: Readiness ready-at-commit
> (`26d690564`), timing instrumentation (`9ca325c41`), published Summary composition
> commit-critical — carried by the answer, seeded to the doc provider, `fps:` cache +
> publish/rollback/delete invalidation (`a70bd8255`), and the declared commit-critical card
> registry closing scalability gap 4 for existing cards (`cc6930d43`). What remains of them is
> BROWSER CERT (auth-blocked) and the full archetype renderer (gaps 1–3).

1. **Cold-frame browser certification (auth first).** Sign the in-app pane into :3013 or connect the
   Claude-in-Chrome extension. Certify: committed panel = the PUBLISHED Summary composition (check
   `window.__focusPanelLayoutSource.docSource` ≠ `default-doc` at commit), Current Work + Household +
   Children + Readiness meaningful at commit, reserved cells show identity, no geometry shift; read
   `[perf:work-unit] focus_panel_chain:*` / `window.__alloyPerf.marks.focus_panel_chain_*` to PROVE
   commit → complete-panel ≈ 0 and record per-card `since_commit_ms` + settlement gap.
2. **Archetype-driven rendering (scalability gaps 1–3).** A brand-new published card type still needs
   code: `buildCardModels` per-key `map.set` + `FocusPanelCardRenderer` per-key switch remain. Move to
   archetype + published placement + data bindings so a NEW published card is honored with zero
   engineering. (Gap 4 — the derived ready set — is closed for the existing card set via
   `focusPanelCommitCriticalCards.ts`; extend that registry's `isKnowable` to published bindings.)
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

- **Branch:** `agent/claude/3-runtime-drawer-deletion` (managed Slot 3 worktree,
  `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion`, :3013).
- **Latest commit:** `cc6930d43` (commit-critical card registry). Based on the `origin/staging` tip
  (`ba5f50cb6`) — 0 behind, nothing to rebase.
- **Not pushed. No PR. No merge. Tree clean (before this docs commit).**
- **Commits session 2026-07-19b** (newest first): `cc6930d43` (registry), `a70bd8255` (published
  composition commit-critical), `9ca325c41` (timing chain), `26d690564` (Readiness ready-at-commit).
- **Commits session 2026-07-19a** (newest first): `c3641cd6e`, `b47c19ac3`, `e678f444a`, `881e4b6aa`,
  `6c3559e6c`, `62ac1002a`, `fa2ee0cc6`, `40a4f9afe`, `79e07f31a`, `20443d02b`. Plus the handoff docs
  commit `48134a96d`.
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
