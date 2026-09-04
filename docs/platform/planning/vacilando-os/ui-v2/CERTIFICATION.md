---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Desktop & Mobile Certification

Evidence for the UI Foundation mission. Screenshots and the machine-checked
results live in [`certification/`](certification/).

## How to reproduce

```bash
node scripts/local-dev/apps/vacilando/certification/capture-ui-v2.mjs
```

It writes PNGs and `results.json` into `certification/` and exits non-zero if any
check fails.

### Why it runs against a fixture

The harness serves the **real browser bundle** (`apps/vacilando/public`) against
a deterministic fixture API on an OS-assigned ephemeral loopback port
(`ui-v2-fixture-server.mjs`).

Two reasons, both load-bearing:

1. **The live gateway is shared.** One instance on this machine serves every
   lane. Certification must not restart it, take a slot, or claim a permanent
   port. This harness claims none.
2. **A certification whose screenshots change with whatever the fleet happens to
   be doing certifies nothing.** The fixtures are fixed, so two runs a week apart
   produce comparable evidence.

The fixture returns the shapes the canonical owners return — that is part of what
is being certified. If a projection's shape drifts, the certification breaks,
which is the intended behaviour.

The fixture lanes deliberately cover the states the operator must be able to tell
apart: one **working with a live progress estimate**, one **blocked on a governed
action**, one **ready** with a completed previous run, one **offline**.

## Viewports

| Name | Size | Why |
|---|---|---|
| desktop | 1440 × 950 | The working width |
| mobile | 390 × 844 | iPhone-class |
| narrow | 320 × 568 | iPhone SE-class — the width that finds clipping |
| keyboard | 390 × 380 | The visual viewport with a phone keyboard open |

## Result

**49 checks, 49 passed, 0 failed.** See
[`certification/results.json`](certification/results.json) for the machine record.

### Desktop

| Screen | Evidence | Checks |
|---|---|---|
| Home | `01-desktop-home.png` | Six blocks render; two-column layout; Needs You lists exactly the genuine blocker; **no invented effectiveness number**; nav badge; nav carries no diagnostics |
| Lanes | `02-desktop-lanes.png` | — |
| Lane | `03-desktop-lane.png` | Breadcrumb, state, identity (`Claude · claude-opus-5 · Slot 6 · Started …`); six tabs; **`Provider estimate: ~62% complete`**; **no ETA anywhere on the page**; Current Work precedes the agent output |
| Lane Inspector | `04-desktop-lane-inspector.png` | A permanent column, not a drawer; **no folded section is open on a healthy lane**; RUN answers agent / slot / context / started / stop; a folded section opens on request |
| Activity | `05-desktop-activity.png` | — |
| System | `06-desktop-system.png` | — |
| Needs You | `07-desktop-needs-you.png` | The tray sits **immediately above the composer**, below the agent output, and is under 90px tall |
| Placeholder mode | `08-desktop-home-placeholders.png` | The page announces the mode; every placeholder value carries its own `sample` chip; values are auditable in the DOM via `data-maturity` |
| Unbuilt tab | — | Renders the shell, says "Not implemented", names `source-control.mjs` as the owner |

### Mobile — 390 and 320

Every check below ran at **both** widths.

| Check | Result |
|---|---|
| No horizontal scrolling on Home, Lanes, Lane, Activity, System | PASS |
| Bottom navigation present with four destinations | PASS |
| Bottom-nav tap targets | 56px at both widths |
| Home stacks to one column, same hierarchy (Needs You first) | PASS |
| Lane composer fully on screen | PASS |
| Lane shows progress and state | PASS |
| Diagnostics hidden from the primary lane screen | PASS |
| "Lane details" opens the inspector | PASS |

Screens: `10-…-home`, `11-…-lanes`, `12-…-lane`, `13-…-lane-inspector`,
`14-…-activity`, `15-…-system` at both `mobile390` and `mobile320`.

### Keyboard open

`16-mobile390-lane-keyboard.png` — with the visual viewport at 390 × 380, the
composer **and its Send button** remain inside the viewport, and nothing scrolls
sideways.

## Defects the certification found and this mission fixed

Certification is only worth running if it can fail. It did, three times.

1. **The global approvals bar rendered a 241px card at the top of every route.**
   Measured at 390 × 844: it pushed the lane header, the work and the composer
   down until the Send button sat **27px below the viewport**. It is the exact
   "large alert card in the middle of the work" the V2 lane replaced with an
   anchored tray. Fixed: the bar is now a bounded, compact strip; it is
   suppressed on Home, where the Needs You block is the canonical summary; and it
   steps aside on a mobile lane, where the tray states the request and
   `.gw-decision-bar` renders the same canonical approve control above the
   composer.

2. **The lane-list header did not wrap.** At 320px, "+ Add Lane" sat 50px past
   the right edge. Fixed with `flex-wrap`.

3. **The lane breadcrumb cost 36px of a phone's header** for information the back
   control already gives. Hidden below 861px.

Two further findings were **check defects, not product defects**, and the check
was made precise rather than loosened:

- Lane tabs are inside a container that scrolls horizontally on purpose. The
  overflow check now ignores descendants of a deliberate scroller.
- A closed mobile drawer is parked off-canvas and is `inert`. The check now
  ignores `inert` / `aria-hidden` subtrees.

Both exclusions are narrow, and `document.documentElement.scrollWidth` is still
asserted separately, so neither can hide a page that actually scrolls.

## What the certification does not prove

- **Live data.** Every value is a fixture. What is and is not wired to canonical
  truth is the subject of [DATA-CONTRACT.md](DATA-CONTRACT.md), not of this run.
- **Real devices.** Chromium at device-scale 3 with `isMobile`/`hasTouch` is not
  an iPhone. Safari-specific viewport behaviour, and the real on-device keyboard,
  are not covered.
- **Accessibility beyond structure.** Roles, `aria-current`, `aria-valuenow` and
  tap-target size are asserted; screen-reader flow and colour-contrast
  measurement of the new V2 components are not.
- **Provider adoption.** The progress bar is certified against an estimate the
  fixture supplies. No provider sends one yet — see
  [TELEMETRY-BACKLOG.md](TELEMETRY-BACKLOG.md) item 1.

## Unit coverage alongside this

`scripts/local-dev/tests/development-gateway-ui-v2.test.mjs` — 41 tests over data
maturity, the progress contract, navigation, Needs You, the lane, Activity,
System, the visual system and mobile. Registered in
`tests/run-execution-durability-tests.sh`.

## Visual review findings (screenshot inspection, beyond the assertions)

Machine checks catch structure; they do not catch a dashboard that is merely
ugly. These were found by reading the captures and fixed in the same pass.

4. **Metric labels truncated instead of wrapping.** `nowrap` + ellipsis on a
   four-across grid produced `SWAP TRA…`, `SLOT CAPA…`, `AUTONOM…`,
   `TESTS PAS…` — a dashboard whose labels the operator has to guess at. Labels
   now wrap to two lines.

5. **Tile density ignored the available width.** Measured at 1440, Home's side
   column is ~400px, so a four-across grid gave each tile 70px and broke words
   mid-syllable (`AUTONOMOU / S`, `responsiv / e`). The narrow column now uses
   two tracks; the wide column and System keep four.

6. **`overflow-wrap: anywhere` split values mid-word.** Changed to `break-word`,
   which only breaks a word that genuinely cannot fit.

7. **Navigation carried provider and context percentage.** The rail rendered
   `Claude · Context 38%` under every lane name — diagnostic information in the
   one surface that has to stay scannable, and explicitly excluded by the IA.
   Rows now carry name, recency and canonical state.

8. **The rail rendered an `UNATTRIBUTED 4` heading** above every lane when there
   was one repository group — the repository equivalent of prominently rendering
   "No folder". With one group, lanes render directly.

9. **The inspector shouted "No folder" and "Not attributed" (in red)** from its
   always-visible area. Absent optional organisation is not a problem to report;
   rename, folder and repository are now a folded Organisation section, and
   remain on the Settings tab where an operator goes to change them.

10. **The rail collapsed an observation-only lane to "Ready".** Removing the
    provider label from navigation removed the only signal that a Cursor
    observation-only lane cannot be instructed. Read-only is a *state*, not a
    provider internal — it changes what the operator can do — so it now travels
    with the canonical state in the rail and in Home's lane list, while the
    provider and model stay one click away in the lane header and Inspector.

11. **Attention and danger painted the same pink.** Measured side by side, the
    first attention tint (`#f9ebe3`) and the danger tint (`#f6e4e0`) were three
    points apart in hue, so "a decision is waiting" and "something is broken"
    were distinguishable only by reading the words. Attention was pulled toward
    the desert/sand end of the brand and danger toward red.

12. **System left a ~380px hole.** A two-track grid sizes every row to its
    tallest cell, so Host (eleven rows) stranded empty space under Capacity
    (five). System now stacks two independent columns, like Home.
