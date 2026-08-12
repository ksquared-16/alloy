---
owner: platform — Adaptive Workspace / BOS
status: RESOLVED
raised_by: Conversation Platform V1 — Communications Hardening
last_reviewed: 2026-08-12
---

# RESOLVED — the floating BOS assistant made scrolled content unclickable

**Closed 2026-08-12**, authorized by the Director. Fix and evidence at the end;
the diagnosis below is kept because it is why the fix is shaped as it is.

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

## Why it was initially deferred (superseded — see RESOLUTION)

The fix alters layout on **every** admin surface, which the hardening milestone
could not authorize on its own. The Director subsequently authorized it, and it
was taken. Two shortcuts were rejected then and remain rejected: narrowing the
Communications column (cosmetic, and leaves `/organization/access` broken) and
changing the global default away from `floating` (a platform UX decision).

## Reproduction

    CERT_APP_PORT=3013 certification/alloy-certify serve
    cd certification && …/playwright test -c ./playwright.config.ts \
      --workers=1 bos-overlay-reachability.cert.spec.ts

The spec prints `[BOS]` lines with the measured rects and per-page coverage, and
fails on any covered control. It is intended to stay red until this is fixed —
it is the acceptance test for the fix.


---

# RESOLUTION

**The fix, in the platform's own idiom.** `pinned` already reserves a column
(`--ws-rail`); `floating` deliberately reserved nothing — the CSS said so:
*"Floating BOS is a body-portaled window — assistant column does not reserve or
float."* That is fine until you remember content SCROLLS under a fixed window.

Floating now reserves too, when it is parked against an edge:

- `bosFloatingEdge()` / `bosFloatingReservePx()` in `web/lib/bos/bosFloatingGeometry.ts`
  decide the edge and the reserve, as pure geometry.
- `BosPresentationControllerContext` publishes `data-bos-floating-edge` and
  `--bos-float-reserve` on the document.
- `adminV2.css` insets `[data-adminv2-workspace-ambient-root]` by that reserve.

**Deliberate limits, so the fix is honest:**

- Reserve applies only while the assistant is parked against an edge — which is
  where `defaultBosFloatingGeometry` puts it, so the DEFAULT experience is safe.
  Dragged into the middle it reserves nothing: a window the operator has
  deliberately placed over their work is theirs to move, and an arbitrary position
  is not expressible as a layout reserve.
- Reserve is skipped when it would squeeze the content column below 720px. A cure
  that crushes the page is worse than the disease.

**None of the forbidden shortcuts were used:** BOS is not hidden on
Communications, no Communications offsets are hardcoded, no page-specific z-index
hack, nothing was shrunk, and the certification dismissals have been **removed**
from both Communications specs.

## Certified 15/15

`certification/playwright/bos-overlay-reachability.cert.spec.ts`, at 1440×900 and
1280×720, with the assistant at its real default:

| Surface | Before | After |
|---|---|---|
| `/organization/communications` | 0 covered, but Configure unclickable once scrolled | **0 covered, click lands** |
| `/organization/access` | **1 covered** ("Open Access Scopes") | **0 covered** |
| `/organization/programs-locations` | not measured | **0 covered** |
| Communications, scrolled to bottom | click swallowed | **0 covered** |
| Assistant closed | — | **0 covered** |

The spec is retained as the regression test for this invariant.
