---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando UI — Product Realization (density + operational surfaces)

> **SUPERSEDED IN PART BY UI V2 (September 2026).** The corrections below are
> still the record of why the Command Center board looks the way it does, and the
> legacy board at `#/command` still reflects them. The *primary* operator surface
> is now the Vacilando Gateway SPA, whose information architecture, visual system,
> data-maturity rules and desktop/mobile certification are owned by
> [`ui-v2/`](ui-v2/README.md). Where this document and the UI V2 contract appear
> to differ about the primary surface, **UI V2 wins**.
>
> Specifically superseded here: the surface list in "Surfaces" (Home, Lanes,
> Activity and System are now the canonical top-level destinations); item 3's
> removal of progress bars (a governed provider progress *estimate* now exists —
> see [the progress contract](ui-v2/PROVIDER-PROGRESS-CONTRACT.md)); and item 7's
> navigation model.

**Role:** Lead Engineer · **Slot 6** · branch `agent/claude/6-vacilando-os-product-def`
Corrects the visible product so Kelly can inspect, continue, manage, and resolve sprint work in one
place. Runtime/command foundation unchanged; this is presentation + navigation only.

## Density & layout corrections (live UI → target)

Compared the current live Command Center against the approved mockup. Exact corrections:

| # | Problem (current live) | Correction |
|---|---|---|
| 1 | KPI cards ~90px tall, 30px numbers, verbose subs | Compact strip: ~62px, 22px numbers, one-line sub; scannable |
| 2 | Sprint rows ~110px (2-line wrapped title + chip on its own line + meta + button row) | Compact 2-line row ~52px (−50%): title truncated inline with status chip; one meta line; one action |
| 3 | Empty progress bars for every sprint (no authoritative progress) | **Removed.** Replaced with lifecycle meta: stage · updated · git ↑/↓ · evidence · questions |
| 4 | Branch/worktree wraps into vertical fragments ("wt-…" over 3 lines) | Truncate with ellipsis + `title` tooltip; full value in detail panel |
| 5 | Six sprints need heavy scrolling | Six rows fit within ~one desktop viewport beside a compact KPI strip |
| 6 | Worker Pool / Activity / Quick Actions over-spaced | Tightened line height + padding; denser rows |
| 7 | Left nav is decorative (no routes) | Real hash router; every item opens a working surface |
| 8 | Rows have no obvious control; actions were equal-weight buttons | One state-derived primary action per row (Open/Resume/Review/Inspect) |
| 9 | Attention cards not clickable | Deep-link to the exact sprint/approval/repository context |

## Surfaces (all bound to `vacilando.snapshot.v1` + the command runtime)

- **Command Center** `#/command` — compact overview: KPI strip, dense sprint list (one action each),
  attention rail (clickable), tightened Worker Pool / Activity / Quick Actions.
- **Sprints** `#/sprints` (+ `#/sprints/:slot` detail) — full sprint table + authoritative detail panel.
- **Workers** `#/workers` — provider board with Diagnose/Pause/Resume/Inspect.
- **Repository** `#/repository` — staging ref + worktrees (branch, clean/dirty, ahead/behind, last
  commit, owner, merge-readiness); promotion/merge shown unsupported with reasons. Observational.
- **Approvals** `#/approvals` — Open questions · Reviews required · Consequential confirmations ·
  Unsupported promotion/merge, each with honest empty states.
- **Activity** `#/activity` — commits · evidence · command audits · source failures, filterable by
  sprint/worker/kind, with honest provenance labels.
- **Knowledge / Settings** — removed from nav (no backed capability this phase).

## Principles honored
Every nav item works; every control is a real governed command or a clearly-explained unsupported;
no invented progress or merge-readiness; identity (cream/forest/terracotta) preserved; SPA stays
presentation-only (no orchestration logic).

## Live QA results (against real toolkit state, 1440-wide viewport)

| # | Check | Result |
|---|---|---|
| 1 | Every left nav item works or is absent | ✅ 6 routes render; Knowledge/Settings removed |
| 2 | All six sprints display compactly | ✅ six rows fit in one viewport beside a compact KPI strip |
| 3 | Long branch/worktree readable | ✅ truncated inline + full value in detail panel |
| 4 | Sprint detail shows authoritative state | ✅ context, worktree/git, worker health, real commits, actions |
| 5 | Worker Diagnose executes through the command runtime | ✅ toast showed real `alloy-worker-doctor 6` output |
| 6 | Pause/Resume uses preview + confirmation | ✅ CONSEQUENTIAL dialog with target + `runs: alloy-worker-pause 6`; cancelled |
| 7 | Right-rail attention deep-links | ✅ attention cards route to the relevant surface |
| 8 | Approvals empty + populated coherent | ✅ empty "No open questions" + real review gate + unsupported box |
| 9 | Browser navigation preserves context | ✅ back/forward via hashchange, no reload/teardown |
| 10 | No static/dead buttons | ✅ every control is a command or a route |
| 11 | No invented percentages or merge-readiness | ✅ progress bars removed; repo shows honest readiness + "no PR tracked" |
| 12 | SPA has no orchestration logic | ✅ certification check 11 asserts it (15/15) |

Regression suites after the rewrite: **alloy-ro 57 · read-core parity 14 · vacilando unit 26 · cert 15**.

Screenshots captured live in the verification session: compact Command Center; Sprints surface;
sprint detail panel (slot 1); Workers surface; Repository surface; Approvals surface; the Pause
preview/confirmation dialog. (Captured via the in-session browser; not persisted as repo files.)
