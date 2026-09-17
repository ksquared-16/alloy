# Handoff — SHARED_WORKSPACE_LAYOUT_DEFECT: the floating BOS rail and the unconsumed reservation

**Handoff ID:** `HANDOFF-SWL-BOS-RAIL-2026-09-16`
**Classification:** `SHARED_WORKSPACE_LAYOUT_DEFECT`
**Owning lane/thread:** shared workspace surface / runtime layout — **not** Thread 11A
**Raised by:** Thread 11A Repair Pass 5H (Financials), while instrumenting the Focus Panel
**BOS source changed by 11A:** **none.** No file under `web/app/adminV2/components/bos*`,
`web/lib/bos/**`, `CommandRailBos*`, or the BOS rules in `web/app/adminV2/adminV2.css` is
touched by the Financials promotion candidate. This document is the entire 11A output on it.

Two defects were measured. **They must be repaired atomically.** Landing only the second,
against a rail that is still stale, reserves the wrong width at every viewport and shrinks
every operational canvas for a rail that is not where the reservation says it is.

---

## 1. The floating rail never repositions

Measured on `/workspace/work-unit/enrolled-children`, BOS presentation `floating`, one page
load with four viewport changes:

| viewport | BOS overlay box | content column | Financials card | Details pointer-reachable | published offset |
|---|---|---|---|---|---|
| 1280×900 | **x=856 right=1256 w=400** | 56..1280 | 962..1227 | **false** | 440px |
| 1440×900 | **x=856 right=1256 w=400** | 56..1440 | 1101..1387 | **false** | 600px |
| 1680×1050 | **x=856 right=1256 w=400** | 56..1680 | 1261..1627 | true | 840px |
| 1920×1080 | **x=856 right=1256 w=400** | 56..1920 | 1421..1867 | true | 1080px |

The overlay's box is **identical at every width**. Content and cards reflow correctly; the
rail does not. At 1920 it is parked in the middle of the canvas. Details is "reachable" at
1680 and 1920 only because the card slid right past a stale rail — not because the layout
resolved.

At 1280×720 on a fresh load the overlay measured `x=578 right=978`, so the stale position is
whatever was current when it was first laid out, not a constant.

**Stale rail coordinates:** `x=856, y=80, w=400, h=616` (right edge 1256).

## 2. The reservation is computed and consumed by nobody

`--adminv2-workspace-command-rail-offset` recomputes correctly on every resize:

```
1280 → 440px    1440 → 600px    1680 → 840px    1920 → 1080px
     = viewport − overlay.left + BOS_RAIL_OVERLAY_GUTTER_PX (16)
```

That is exactly the reservation the content column needs. It is declared `0px` at
`web/app/adminV2/adminV2.css:7`, named once more as `BOS_DRAFT…`/`BOS_DRAWER_RAIL_OFFSET_CSS_VAR`
in `web/lib/bos/bosOverlayGeometry.ts:6`, written by
`web/app/adminV2/components/useWorkspaceCommandRailDrawerOffset.ts`, and **read by no rule and
no component anywhere in the tree**.

Related geometry measured empty on this surface: `--adminv2-drawer-computed-*` and
`--operational-workspace-*`, with `panelIsOperational: false` — the work-unit record modal is
**not** an operational workspace, so the "floating BOS must not shrink the operational band"
rule in `web/lib/bos/operationalWorkspaceGeometry.ts` never applied here in the first place.

## 3. 1280 proof — the occlusion itself

```
BOS_1280x900  bosPresentation "floating"   overlay x=856 w=400
  card    x=962 w=265
  payment {box:{x:976,y:650,w:73,h:22}, reachable:false, topmost:"DIV.rounded-xl border px-2.5 py-2.5"}
  add     {box:{x:976,y:676,w:42,h:22}, reachable:false, topmost:"P.mt-2 text-center text-[10px]"}
  details {box:{x:1036,y:676,w:59,h:22}, reachable:false, topmost:"P.mt-2 text-center text-[10px]"}
  bosComposerReachable: true      horizontalOverflow: false
```

The occluders are the rail's **own chrome** — the composer and its hint text. Making the
overlay pointer-transparent is therefore not a candidate repair; there is real UI there.

Occluder chain: `DIV.bos-rail-composer[data-command-surface-rail-composer]` →
`FOOTER[data-adminv2-ai-command-surface][data-adminv2-command-surface-layer=rail]` →
`DIV.adminv2-ws-command-rail-bos-dock` →
`DIV.adminv2-bos-rail-overlay[data-bos-overlay-mode=floating]` (section **WU-14**, owner
`web/app/adminV2/components/CommandRailBo…`).

## 4. Required atomic repair

1. **The BOS rail follows canonical workspace/layout geometry** — its own box tracks the
   workspace the way its offset already does, rather than holding its first measured position.
2. **Operational content consumes the canonical command-rail reservation** — the ambient root's
   content column (`[data-adminv2-workspace-ambient-root]`, which already carries
   `data-bos-presentation`) respects `--adminv2-workspace-command-rail-offset` while BOS floats.

Both, in one change. Not the reservation alone against today's stale rail. Not a
Financials-specific offset.

## 5. Required regression surfaces

Every cell of: **{Enrollment, Financials, Work Items, Attendance, one further representative
operational workspace} × {BOS open, BOS closed} × {1280, 1440, 1680, 1920}**, asserting per cell:

- the surface's primary commands are **pointer-reachable** (`document.elementFromPoint` at each
  control's centre returns that control or a descendant — not a visibility or z-index check);
- **no horizontal page overflow** (`documentElement.scrollWidth <= innerWidth`);
- the **BOS composer remains usable** (same reachability test);
- the rail's box tracks the workspace across a viewport change within one page load.

The instruments 5H used are committed and reusable:
`web/playwright/tests/zz-p5h-bos-occlusion.spec.ts` and
`web/playwright/tests/zz-p5h-rail-anchor.spec.ts`.

## 6. Scope statement for Financials QA

Until this is repaired, at 1280 and 1440 the Focus Panel's Financials commands can sit under
the floating rail. That is **this** defect, external to Financials, and must be stated as such
rather than rediscovered as a Financials failure.
