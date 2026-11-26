---
owner: platform
status: active
last_reviewed: 2026-07-19
---

# Runtime Browser Findings (this session)

Browser evidence gathered/observed this session and what each item proved. Screenshots were supplied by
the operator (Kelly) in-session; they are referenced descriptively (not committed as binaries).

> NOTE on the cert environment: the in-app Browser pane has its own cookie jar, ISOLATED from the
> operator's Chrome login. So authenticated cold-frame cert against the operator experience did NOT run
> this session — the operator ran the app in their Chrome and supplied screenshots. Fixing this
> (drive the operator's Chrome, or sign into the in-app pane) is a prerequisite for the next session's
> certification.

## Evidence & what it proved

1. **Standalone Current Work in a different layout (early).** The pending Focus Panel rendered a
   standalone `CurrentWorkRuntimeCard` in a different geometry than the resolved grid. **Proved:** the
   commit-critical and enriched paths were different renderers → a "preview then real panel" swap. →
   Fixed structurally by the source-agnostic grid (`881e4b6aa`).

2. **Two-frame screenshots — header metrics blank→filled, Current Work narrower→wider.**
   - Frame 1: header KPI tiles blank (gray), Current Work narrower, right-column cards blank outlines.
   - Frame 2: header KPIs filled (3 / 4 / 6), Current Work WIDER, right-column still blank.
   **Proved:** (a) composition was stable (reserved cells present in BOTH frames — the Phase-3
   configuration-driven composition held); (b) Current Work RESIZED across the transition — a geometry
   change; (c) multiple visible readiness boundaries. The resize was traced to a **remount** (the
   pending and enriched bodies were different components under a CHANGING key), not composition. →
   Remount fixed by the one-body + stable-key change (`e678f444a`).

3. **"Remount fixed internally but product behavior still wrong" (operator).** After the remount fix,
   the operator reported no meaningful improvement: Current Work still appeared substantially before the
   rest; configured cells stayed blank too long; the panel still resolved in multiple visible stages.
   **Proved:** remount was a red herring; the CORE failure is **preparation completeness** — the
   commit-critical `FocusPanelWorkModeModel` carried only `current_work`; every other card had no data
   in `context.truth`, so they rendered as blank reserved cells until the drawer VM (Settlement)
   landed. "Reserved geometry is not completion; blank white rectangles are still a loading state."

4. **Blank reserved cards.** The right-column cards (Household, Children) and lower cards were empty
   white rectangles at commit. **Proved:** the answer must CARRY the commit-critical card content.
   → Household + Children fixed (`b47c19ac3`, sourced from the answer with no new DB read); reserved
   cells given identity + "Preparing…" (`c3641cd6e`). NOT yet browser-verified.

5. **Current Work behavior.** Current Work is operational from the answer's `stage_work_runtime` at
   commit ("Contact Family", "Record outcome", progress/requirements). **Proved:** Current Work is no
   longer the architectural issue — the first meaningful action IS available at commit.

## Timing observations

- No formal instrumentation was added this session. Qualitatively: the drawer VM (Settlement) arrives
  ~one async tick to seconds after the atomic commit (`useRecordWorkRuntime` resolves it in an async
  effect; even a warm session-cache hit returns a promise, so `enriched` is null on the commit frame).
  This is WHY the answer must carry commit-critical card content rather than relying on the prewarmed
  VM. **Required next:** instrument destination commit → provisioning answer available →
  FocusPanelWorkModeModel available → each card becoming ready → Settlement arrival, and prove there is
  essentially no gap between commit and a meaningfully complete first panel.

## Remount investigation (closed)

Three remount sources were found in `InlineOpportunityFocusPanel`: the `key={bodyRenderKey}` changing
`"pending"→entity-id`, different component types (commit-critical body vs mode body), and an extra
wrapper. All three were removed (one body, stable subject-id key). Per operator direction, do NOT spend
further effort on keys/wrappers/remount unless new evidence shows a remount remains.
