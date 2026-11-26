# Final bounded UX backlog — dispositions

Inspected mounted against deployed `6fe3683570de`. Every item finishes as exactly one verdict.

## A · 143px whitespace above ledger — **PASS — CURRENT PRODUCT ACCEPTABLE**

The measurement reproduces exactly: lens bar bottom 497, first ledger row top 641, **gap 143 px**.

But the frame says that distance is not whitespace. Between those two anchors sit, in order: the
three ledger filter controls (Everyone / All periods / Anyone responsible), the `LEDGER` label, two
COLLAPSED period summaries (December 2026 · Balance $0.00, October 2026 · Balance $80.00), the
expanded SEPTEMBER 2026 header with its balance, and the column head. Every pixel is doing work.

An intermediate arithmetic pass of mine reported "106 px genuinely empty". That was wrong: the
element scan was truncated to the first fourteen entries and then filtered to `DIV`, which dropped
the period rows occupying the span. The screenshot settles it.

The historical "143 px whitespace" reading measured anchor-to-anchor distance and called it a void.
Judged as a frame — which is what the instruction asks — the ledger is not disconnected from its
controls. No repair; compressing this would delete the period summaries an operator reads.

## B · intermittent ledger formatting — **NOT REPRODUCED — EVIDENCE CAPTURED**

Swept 3 widths (1280/1440/1680) × up to 6 lenses × 116 rows.

A first detector reported 468 anomalies. It was measuring `scrollWidth - clientWidth > 2` on each
row: every row is `display: grid` inside a container that scrolls horizontally **by design**
(row delta 100 px, parent delta 100 px, `overflow-x: visible` on the row, document overflow 0 at
every width). That is the sanctioned wide-table pattern, not a defect — a real formatting fault
would not appear on all 116 rows identically.

With that corrected, no row height outlier, no clipped row, and no document overflow was observed
at any width or lens. No repair invented.

## C · persistent site filter — **PASS**

The control is a button (`aria-label="Site filter"`), not a native select; an earlier probe looked
for a `<select>` and found nothing, which is why this first read as unknown.

Selected **North Campus**, navigated Overview → Accounts → Overview, and the control still read
**North Campus**. Persistence survives section navigation, which is the boundary the item names.

## D · Overview mounted recheck — **PASS**

KPI landing present and populated: `MONEY RIGHT NOW · $2,293.82 Outstanding · $2,293.82 Collectible
now · $2,396.87 Gross charges posted · $308.00 · $125.00 · $1,450.00 · $75.00`. Bend Pine treatment
present in the DOM. One `$0.00`, which is a real figure rather than a blank rendered as zero.
Horizontal overflow 0.

## E · Focus/Details dropdown treatment — **PASS**

**Zero visible native `<select>` elements** — no native-select regression. The three ledger controls
render as compact custom controls side by side (Everyone / All periods / Anyone responsible), and
the Adjust Charge panel's four controls use the same grammar. No wrapping or clipping at 1280–1680.

## F · Description layout — **PASS**

`DESCRIPTION` is a proper ninth column with its own header, not a trailing fragment. Values read
correctly per row — "Monthly tuition", "Materials", "Registration fee". Column order: ACTIONS ·
DATE · TYPE · CHILD · GL ACCOUNT · AMOUNT · STATUS · RESPONSIBLE PARTY · DESCRIPTION. It sits past
the fold at 1440 and is reached by the table's own horizontal scroll, which is the designed pattern
for this width.

## G · Adjustment presentation — **PASS**

Entry path opens `ADJUST CHARGE` as a focused command layer with every element the item names:
**Against enrolment** (Certa Certhouse) · **Against charge** (Materials · 2026-09-25 · $18.00
outstanding) · **Type** (Credit — lowers what the family owes) · **Amount** · **Reason** ·
**Effective date** (Sep 25, 2026) · **Preview / Confirm / Cancel**. No overflow.

Presentation in the ledger is also correct under the Credits & adjustments lens: Credit, Discount
and Reversal rows against GL 4060 · Discounts & Credits, with signed amounts (−$7.77, −$18.50,
+$12.34) and honest statuses (draft, posted, reversed). Adjustment rows show `—` for DATE, which is
the canonical reserved treatment for a fact those rows do not carry — not a blank and not invented.

Economics were not reopened; this was presentation and interaction only.
