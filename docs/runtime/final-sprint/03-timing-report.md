---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime Timing
---

# Runtime Timing Report — Final Sprint

Measured live via `focus_panel_chain_*` marks (relative to `focus_panel_chain_commit`, the K3
atomic-commit epoch) and `perceived_*` marks. Dev/staging build, warm and cold paths.

## The commit chain (New Leads → Wenc Family)

```
Destination Commit (K3)                      t = 0        (focus_panel_chain_commit)
  ↓
FocusPanelWorkModeModel available            +50 ms       (model_commit_critical)
  ↓
Commit-critical cards ready                  +50 ms       current_work, household, readiness
  ↓
Settlement (enriched drawer VM)              +137 ms      (warm, in-app nav)
  ↓
Remaining published cards ready              +137 ms      billing_preview, children (settlement-sourced)
```

Warm in-app navigation: **commit → meaningfully complete summary ≈ 50 ms**; full settlement **+137 ms**.

## What the numbers show

- **The operational summary is immediate.** current_work / household / readiness are ready 50 ms after
  commit, sourced from the answer with no new DB read. The operator can act (Record outcome, requirements)
  at commit.
- **Settlement is fast on the warm path** (+137 ms) and enriches in place — no geometry shift (measured
  0px on subject switch), no card-by-card assembly of the commit-critical set.
- **Cold full-page load settlement is slow** (+9152 ms in one direct-URL cold measurement). This is the
  cold drawer-VM fetch, not the summary — the summary still rendered at +38 ms. The gap is deeper
  settlement detail (children roster / billing), acceptable but worth profiling.

## The remaining timing bottleneck (measured)

For **this org's published composition** (`current_work, household, billing_preview, children`), two of
the four Summary cards — `billing_preview` and, for a childless new lead, `children` — are **not
commit-critical** and only become ready at settlement (+137 ms warm). They reserve identity at commit
("Preparing…") and fill in place.

- `billing_preview` is genuinely settlement (billing config is not in the answer). Reserved-with-identity
  is the correct treatment.
- `children` is commit-critical **when the subject snapshot carries `inquiry_children`**; a brand-new
  lead with no linked children legitimately has none, so it reserves.

Net: on the warm path the "second visible stage" is a single 137 ms settlement tick filling two reserved
cells that already show their identity — within the acceptable "reserved geometry, not blank" doctrine.
The Current Work summary trim (Report 01/B) removed the *other* second-stage source (settlement-derived
More actions / transitions / activity popping into the Current Work card).

## Instrumentation delivered

- `lib/adminV2/runtime/focusPanel/focusPanelCommitTiming.ts` — `focus_panel_chain:*` boundary marks:
  `destination_commit` (epoch, K3 `onCommitCompleted`), `model_commit_critical` (`ready_count`,
  `since_commit_ms`), `card_ready` per card (first ready, `card_key`, `source`, `since_commit_ms`),
  `settlement` (`since_commit_ms`, `since_model_ms`).
- Mirrored to `window.__alloyPerf.marks.focus_panel_chain_*`; console filter `[perf:work-unit]
  focus_panel_chain:*`. Dev/staging gated, boundary-only (fires on model identity change, not per frame).

## Recommended next measurements (for the surfaces not yet runtime consumers)

Activity, Processing, Work Items, and OI have no commit chain to measure — they mount+fetch. Once they
become runtime consumers (tasks D/E), extend `focusPanelCommitTiming` (or a sibling) to mark their
destination commit → answer → settled, and re-measure. Today their "timing" is just fetch latency
(Activity: 1 fetch; Processing: 5; Work Items: 8; OI: 5 on open).
