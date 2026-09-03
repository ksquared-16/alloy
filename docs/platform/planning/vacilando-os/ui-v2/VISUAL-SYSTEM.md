---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Visual System

Changes and additions to the Vacilando visual language. The approved seven-colour
brand palette is unchanged; what changed is what the product *does* with it.

## 1. Grounds — four, not six

Six near-identical creams were in play (`#f6f2ea`, `#efe9dd`, `#fbf9f4` plus
three line tints), which is why the app read as beige-on-beige with no clear
sense of what was a surface and what was the page.

| Token | Value | Meaning |
|---|---|---|
| `--bg` | `#f4efe6` | The application canvas: warm cream/sand |
| `--bg-tint` | `#ebe4d6` | Selection / hover **on** the canvas |
| `--card` | `#fff` | An elevated working surface |
| `--card-2` | `#faf7f1` | An inset **inside** a surface |

Borders derive from the canvas (`--line`, `--line-soft`, `--line-strong`) rather
than being their own invented colours.

**White now means exactly one thing: an elevated working surface.**

## 2. The rail and the brand mark — the mismatch resolved

The rail was card white and the brand mark painted its own cream plate inside
it, so the logo sat on a visibly different ground from the navigation containing
it — a cream rectangle floating in white.

- `.rail` is now `background: var(--bg)` — the warm canvas the artwork was drawn
  for.
- `.brand-mark` is `background: transparent`, no padding, no plate radius.

The measured constraint that produced the plate is unchanged and still honoured:
on juniper the artwork's pine reads at 1.11:1 and its river at 1.55:1, so the
mark must never sit on a dark ground. It now sits on a light ground provided by
the shell itself. Enforced by `development-brand-assets.test.mjs` and
`development-gateway-rail.test.mjs`.

The PWA manifest's `background_color` tracks `--bg` (`#f4efe6`).

## 3. Semantic colour is now the brand

The previous semantics — `#3a8a5b` success, `#5f7c9a` planned, `#c98a2e` review,
`#cf5a3a` blocked — sat outside the approved seven, so a healthy lane, a running
lane and a waiting lane were each drawn in a colour the product used nowhere
else.

| Meaning | Token | Brand colour |
|---|---|---|
| Primary action · active · healthy · selected | `--ok`, `--green` | pine / juniper `#365C4A` |
| Progress · running · informational | `--run` | river `#3F7891` |
| Quiet secondary state | `--plan` | sage `#6F8055` |
| **Meaningful attention** | `--attn` | terracotta `#D96C4A`, tint `#fbeedd` |
| **Destructive / error only** | `--danger` | `#a8392c`, tint `#f7dedb` |

**Attention and danger must be distinguishable without reading.** Measured side
by side, the first pair of tints (`#f9ebe3` / `#f6e4e0`) were three points apart
in hue, so a pending decision and a broken thing painted the same pink.
Attention is now pulled toward the desert/sand end of the brand; danger toward
red.

**Red is reserved.** "Busy", "waiting" and "high number" are not errors, and
giving them red is what made every screen look like an incident. Enforced:
`.vstate.is-run` may never reference `--danger`.

Contrast is preserved through the existing `-ink` derivations
(`--vacilando-terracotta-ink`, `--vacilando-river-ink`, `--ok-ink`,
`--danger-ink`) for small text on tinted surfaces.

## 4. One state vocabulary

Two functions in the whole product turn a condition into a colour:

- `healthDot(health)` — `healthy` · `watch` · `problem` · `unknown`
- `stateDot(label, { tone, live })` — a lane's canonical work state

A surface that wants to say "this is fine" uses them; it does not pick a green.
No page function may inline a colour — enforced by test.

The live dot is the only motion in the product (`@keyframes vpulse`), and it
means one thing: something is happening right now. It respects
`prefers-reduced-motion`.

## 5. Elevation, radius, borders

| Token | Value |
|---|---|
| `--radius` | `12px` |
| `--radius-sm` | `9px` |
| `--radius-lg` | `16px` |
| `--pill` | `999px` |
| `--shadow` | `0 1px 2px …, 0 5px 14px …` |
| `--shadow-sm` | `0 1px 2px …` |

V2 components use the tokens, never a pixel literal — enforced by test. Cards
carry `--shadow-sm` and a `--line` border: soft elevation, quiet borders.

**Attention is a left edge, not a filled panel.** `.vcard.is-attention` uses
`inset 3px 0 0 var(--attn)`. A tinted block for every pending decision is how
three requests turn a page into a warning screen.

## 6. Provenance is a visual property

Because every value carries its data maturity, provenance is drawn:

| State | Treatment |
|---|---|
| `is-live` | Full ink, tabular numerals |
| `is-placeholder` | Dashed border, transparent ground, a permanent `sample` chip |
| `is-unavailable` | Copy at body size in `--ink-3` — never a number |

An unbacked number therefore cannot look like a measured one.

## 7. Progress is river, never pine

Pine means done or healthy. A bar that is 62% pine reads as 62% *success*, which
is not what a provider estimate says. Progress fills with `--run`, and low
confidence is expressed as texture (a hatch), not as a different hue — the same
fact, held less firmly.

## 8. Typography and density

- Page titles 23px/650, lane titles 19px/650, card titles 11px uppercase 700
  with `.09em` tracking in `--ink-3`.
- Body 13–13.5px; metrics 15.5–17px with `font-variant-numeric: tabular-nums`.
- Sentence case for controls ("Rename lane", "Stop lane", "Lane details").
- Long values use `overflow-wrap: anywhere`; every V2 grid track is `minmax(0, …)`
  so a long value cannot force a column wider than its container.

## 9. Mobile

Designed, not compressed:

- The desktop primary nav is *replaced* by a bottom bar, not shrunk.
- Multi-column layouts stack (`minmax(0,1fr)`) rather than squeeze.
- Activity reflows from four columns to two lines via `grid-template-areas`.
- Tap targets: bottom bar ≥ 56px + `env(safe-area-inset-bottom)`; inspector
  summaries 44px; lane tabs 42px; tray buttons 40px; selects 38px.
- A 380px breakpoint exists for iPhone SE-class widths.
- The lane interaction zone is pinned inside the tracked visual viewport
  (`--gw-vvh`), so the composer stays reachable with the keyboard open; the
  bottom bar yields to the composer on a lane.

## 10. What was deliberately not changed

The seven approved brand colours, the artwork, the wordmark, the icon set, the
`--script-face` treatment, and the measured contrast ratios recorded in the
`:root` comment block. This pass changes how those are *applied*, not what they
are.
