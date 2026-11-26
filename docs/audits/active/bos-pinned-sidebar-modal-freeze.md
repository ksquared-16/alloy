---
owner: platform
status: open
last_reviewed: 2026-08-15
supersedes: []
---

# BOS pinned — opening any sidebar modal freezes the main thread

**Class:** platform shell / BOS rail. **Not** a Communications defect.

Found during Communications V1 workspace convergence certification
(`wt3-communications-inbound-sms`, cert app on :3013). Recorded here because the
finding is durable and blocks a certification claim that would otherwise look
merely absent.

---

## Reproduction

1. Load `/workspace`.
2. Click the BOS rail pin — `[data-bos-pin]`
   (`web/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx:125`).
3. Click any sidebar modal entry:
   - `[data-adminv2-sidebar-modal-nav="inbox"]`
   - `[data-adminv2-sidebar-modal-nav="tasks"]`
   - `[data-adminv2-sidebar-modal-nav="scheduling"]`

## Observed

- Playwright reports the element **visible, enabled and stable**, then hangs
  permanently at `performing click action`. It does not complete at 600 s.
- The modal never opens.
- `page.evaluate(() => 1 + 1)` **does not resolve** — the main thread is stuck.
- **Zero** console errors. No React `Maximum update depth exceeded`. So it is a
  synchronous long/infinite task, not an obvious render loop.
- `document.elementFromPoint` at the nav's centre returns an element **inside**
  the nav button — nothing is intercepting the click.

## Scope

All three navs hang identically. **Tasks and Scheduling share none of the
Communications workspace code**, which is what places this in the shell rather
than in any one workspace. Floating (unpinned) BOS is unaffected: the same
gestures work normally.

Suspected area: the pinned overlay anchoring path
(`web/app/adminV2/components/CommandRailBosMount.tsx`,
`useBosRailOverlayAnchorStyle`) interacting with sidebar modal mount — the anchor
style recomputes from element geometry, a modal mount changes that geometry,
which recomputes the anchor.

## Why this blocks a Communications claim

Compose New cannot be reached in the pinned state by **any** operator gesture, so
there is nothing to assert about its layering until this is fixed.

Communications acceptance therefore reads:

> Compose New overlay certified **floating**; pinned-mode certification
> **blocked** by this cross-workspace shell defect.

The pinned case is **not** passed and must not be recorded as such. The
certification spec
(`certification/playwright/communications-identity-and-composer.cert.spec.ts`)
carries the same statement in a comment, so the absence of a pinned test reads as
a known gap rather than as coverage.

## Suggested start

Profile the main thread while performing step 3 with the pinned rail mounted, and
look for an unbounded layout-measurement loop in the pinned overlay anchor.
