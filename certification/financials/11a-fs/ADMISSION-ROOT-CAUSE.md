---
title: Thread 11A — why Billing Preview never mounted
status: sprint
---

# ROOT CAUSE ESTABLISHED

A published Focus Panel document carries **two independent card lists**, and only one of them
decides what renders.

| list | contains `billing_preview`? | what it does |
|---|---|---|
| `doc.sections` | **YES** (added by v159, made visible in v160) | authored card metadata: key, tier, span, density, visibility |
| `doc.metadata.focusPanelLayout` | **NO** | `{ grid: { areas, columns }, rows }` — the operator-published explicit layout, and the render **source of truth** |

`readFocusPanelPublishedLayout(doc)` reads `doc.metadata["focusPanelLayout"]`. The component comment
states the consequence plainly: *"Operator-published explicit layout (source of truth). When present
the runtime renders these exact rows/widths."*

My v159/v160 republishes edited **only `doc.sections`**. The metadata layout was cloned forward
untouched, so it has never named the card.

## The proof is one-to-one

`focusPanelLayout.grid.areas` names exactly six cards:

`business_process · financials · children · household · attendance · health_safety`

The mounted panel renders exactly those six. Not a subset, not a superset — the same list.

## The forensic chain, measured end to end

| question | measured value |
|---|---|
| `familySettlement` | **true** — the panel fetched the published doc, which it only does when the flag is true |
| `focusPanelSummaryUsesPublishedDoc(child, ctx)` | **true** |
| document selected | **PUBLISHED**, `id 3bc7f601-ceec-4cd6-937b-e26fcea4ddfc`, **version 160** |
| request | `/api/admin/entity-layouts/focus-panel-summary?workViewId=new_work_view_7&stageKey=enrolled` |
| `billing_preview` in `doc.sections` | **YES**, `visibility: "visible"` |
| `billing_preview` in `doc.metadata.focusPanelLayout` | **NO** |
| first stage where it disappears | **`readFocusPanelPublishedLayout` → `filterPublishedLayoutToVisibleCards`** — it was never in the layout to be filtered |

## Hypothesis verdict

**FAMILY-SETTLEMENT HYPOTHESIS — FALSE.** `familySettlement` is true, the published document *is*
selected, and v160 *is* what the panel receives. The earlier inference from geometry was wrong: the
mounted geometry matches the code composition only by coincidence of both being area-based.

## Eliminated, cumulatively

Missing producer · code-owned grid excluding published additions · stale layout cache · component
mapping · grain declaration · authored `linked` visibility · family settlement. Seven.

## The repair — NOT performed in this run

This run was scoped to one measurement, and its instruction says *"Do NOT change layouts again."*
That prohibition existed to stop unmeasured layout churn; the churn is now explained, but the call
to spend another publication belongs to Kelly, so the repair is specified rather than executed.

Add `billing_preview` to `doc.metadata.focusPanelLayout` — both `grid.areas` and the `rows`
projection — in one further append-only publication (v161):

```
{ card: "billing_preview", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 }
```

Columns 1–6 of rows 8–9 are free (attendance holds 7–12 there), and this mirrors the code
composition's own placement of the card at `colSpan 6, rowStart 8, rowSpan 2`. The `sections` entry
and its `visible` visibility are already correct from v160 and need no further change.

**A lock should accompany it** that crosses this exact decision: an authored, visible card absent
from the published layout metadata must not silently vanish — either it renders, or the publication
is refused. Today a section can be published that the runtime will never draw, with no error
anywhere, which is what cost this thread several runs.
