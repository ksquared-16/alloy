---
title: Adjustment UX Convergence — the stacking defect, measured
program: Financials V1
slice: Adjustment UX Convergence
run: erun_7ca2204cd141d507
---

# THE STACKING DEFECT, MEASURED ON DEPLOYED BEFORE ANY REPAIR

The Director reported: Add → Charge presents correctly; Add → Adjustment leaves the underlying
Financials card visibly protruding behind the Adjustment card. A previous run narrowed it to
"content/overflow within the same shared lifted element, not a second overlay" — and that narrowing
turns out to be exactly right.

Both commands open **the same** elevated host: `.alloy-os-ucard[data-universal-card-modal="command"]`,
`z-index: 60`, `position: absolute`, `overflow: hidden`, with `.alloy-os-ucard__body` as its scroll
container. So any difference between them comes from what each one puts inside it.

Measured on `staging.workwithalloy.com` at three viewports, in one session, same account, same card
— `zz-11d-adjustment-stacking.spec.ts`, raw output in `BEFORE-deployed-measurement.txt`:

## WHAT EACH COMMAND PUTS IN THE SHARED HOST

| property | Add → Charge (`.alloy-os-addcharge`) | Add → Adjustment (`.alloy-os-fdetail__movepanel`) |
|---|---|---|
| `border-top-width` | **0px** | **1px** |
| `border-top-left-radius` | **0px** | **12px** |
| `background-color` | **rgba(0,0,0,0)** — transparent | **rgb(255,255,255)** — opaque |
| `max-height` | **none** | **520px** |
| `overflow-y` | **visible** | **auto** |
| `z-index` | **auto** | **61** |
| painting above the host's own layer | **none** | **the band itself** |

The host is `z-index: 60`. The band is `61`. A descendant one layer above its own host paints over
that host's rounded 20px edge — which is the protrusion, and it is the same at all three widths.

## THE CONSEQUENCE, IN PIXELS

| viewport | host cap | Charge card | Adjustment card | shortfall |
|---|---|---|---|---|
| desktop 1680×1050 | 711px | **694px** | **569px** | **125px** |
| tablet 834×1112 | 734px | **734px** | **569px** | **165px** |
| phone 390×844 | 358px | 358px | 358px | 0 (both viewport-capped) |

The Adjustment card stops 125–165px short of the room the host gave it, because the band caps
*itself* at 520px and scrolls inside a container that is already scrolling. Charge, with
`max-height: none`, grows to the host's cap and is bounded by it.

At phone width the host body genuinely overflows (`selfScrolls: true`, 307px of 537px cap) **and**
the band still declares `overflow-y: auto` with its own 520px cap — the nested-scroll pair §20
forbids, not yet overflowing only because the band's content is 496px against its own 520px.

## WHY THIS IS THE SHARED CONTRACT AND NOT A HEIGHT

`.alloy-os-fdetail__movepanel` was written as a **band inside the Details card** — under the ledger,
on the card's own surface — and everything above is what that role legitimately needs. Convergence
made the same element the **body of a command card**, where the host already supplies the perimeter,
the scrim, the viewport cap and the scroll container.

`.alloy-os-addcharge` learned this first, and its own CSS comment records it: it "carried its own
border, radius, white background and 480px cap from when it was a lab specimen standing on a page.
Inside the elevated host that produced a bordered card floating in a bordered card, which is the one
thing every other centered surface does not do." It was stripped, and has presented correctly since.
The Adjustment band was never given the same treatment.

So the repair applies the existing contract rather than special-casing a pixel, and it is scoped to
the **host marker** (`.alloy-os-financials__entrybody > .alloy-os-fdetail__movepanel`) so the panel
keeps its full band presentation everywhere it is genuinely a band — Move payment, Reverse,
Responsibility. No second modal primitive was introduced.

## ONE MORE ASYMMETRY THE MEASUREMENT EXPOSED

In the Adjustment probe, `data-financials-overlay` reads **`add_charge`** — the Adjustment command
returned its `UniversalCard` bare while every other command wraps its card in a host div. So the
Adjustment layer was the one command layer with no name of its own in the DOM, which is why a
responsive measurement had nothing to anchor on. The repair gives it `add_adjustment`.
