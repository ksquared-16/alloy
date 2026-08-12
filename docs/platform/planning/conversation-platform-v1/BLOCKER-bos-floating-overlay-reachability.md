---
owner: platform — Adaptive Workspace / BOS
status: blocker
raised_by: Conversation Platform V1 — Communications Hardening
last_reviewed: 2026-08-12
---

# BLOCKER — the floating BOS assistant makes scrolled content unclickable

**Invariant violated:** *platform chrome must not make underlying primary actions
unreachable.*

**Ownership: NOT Communications.** This is shared Adaptive Workspace chrome and it
reproduces on another Organization surface with no Communications code involved.
It is raised here because Communications certification is what measured it.

## What the assistant is, by default

`recommendBosPresentation()` returns `"floating"` **unconditionally**
(`web/lib/bos/bosPresentationState.ts:42-46`). An operator with no stored
preference therefore gets a floating, interactive panel on every admin surface —
this is the default experience, not an opt-in.

Measured geometry, certification defaults, no stored preference
(`certification/playwright/bos-overlay-reachability.cert.spec.ts`):

| Viewport | Panel rect (x, y, w × h) | z-index | pointer-events |
|---|---|---|---|
| 1440 × 900 | 1016, 232, 400 × 620 | 95 | `auto` |
| 1280 × 720 | 856, 80, 400 × 616 | 95 | `auto` |

## The actual failure mode — it is about SCROLL, not initial layout

This is the part the first report got wrong, and the correction matters.

**Statically, nothing is covered.** Of the controls visible in the viewport on
`/organization/communications`: **0 of 28 covered**, at *both* viewports.

**The panel is `position: fixed`. The content scrolls underneath it.** So any
control below the fold becomes unreachable the moment it is scrolled into the
panel's band — which spans nearly the full height (y 80→696 at 1280 × 720).
Playwright scrolls a target into view before clicking, lands it under the panel,
and the click is swallowed:

    <div data-adminv2-bos-rail-overlay="true" …> subtree intercepts pointer events
    26 × waiting for element to be visible, enabled and stable

Reproduced on `communications-configure-sms` at **both** viewports.

## It is not Communications-specific

`/organization/access`, with no Communications code in play:

| Viewport | Covered controls |
|---|---|
| 1440 × 900 | **1** — "Open Access Scopes" |
| 1280 × 720 | **1** — "Open Access Scopes" |

That one is covered *without any scrolling at all*. Any admin surface with
content in the right ~400px, or with anything below the fold, is affected.

## Why this sprint did not fix it

The correct fix is for the workspace to reserve the panel's area when floating (or
for the panel to stop taking pointer events when it is not the operator's focus).
Both are changes to shared chrome that alter layout on **every** admin surface.
This sprint can neither certify that breadth nor safely own the regression risk,
and the milestone explicitly excludes general organization UX work.

Deliberately **not** done:
- narrowing the Communications content column so it never reaches the panel —
  cosmetic, wrong on wide screens, and leaves `/organization/access` broken;
- changing the global default presentation away from `floating` — a
  platform-wide UX decision, not a Communications one.

## What Communications does instead, and its exact limit

Both Communications certification specs dismiss the assistant explicitly
(`data-bos-presentation="closed"`) with the reason stated in the code. That keeps
the specs measuring Communications rather than the assistant's geometry.

**It does not make the product correct.** A real operator on a default profile can
scroll a Configure control under the panel and find that clicking does nothing,
with no error and no explanation. This remains **open** in production-readiness
status until the owner fixes it.

## Reproduction

    CERT_APP_PORT=3013 certification/alloy-certify serve
    cd certification && …/playwright test -c ./playwright.config.ts \
      --workers=1 bos-overlay-reachability.cert.spec.ts

The spec prints `[BOS]` lines with the measured rects and per-page coverage, and
fails on any covered control. It is intended to stay red until this is fixed —
it is the acceptance test for the fix.
