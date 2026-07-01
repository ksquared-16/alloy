# Presentation Data & Analytics — Mockups

**Deliverable 8.** High-fidelity HTML mockups for the Presentation Data Model's authoring surfaces. Each `.html` renders standalone; a captured `.png` sits beside it.

> **Visual contract:** reuses the Alloy runtime visual language (pine `#00a283`, midnight `#1a2332`, stone, white-canvas, emerald gradient; violet `#6d54c7` is used *only* to mark Operational-Intelligence-owned / governed surfaces, reinforcing the definition-vs-presentation split).

## Index

| # | File | Demonstrates | Deliverable mapping |
|---|---|---|---|
| 01 | [`01-data-source-browser.html`](./01-data-source-browser.html) | The 3-pane business-concept browser (Area → Path → Leaf); type + compatible renderers; technical path secondary | Data Browser |
| 02 | [`02-relationship-picker.html`](./02-relationship-picker.html) | Named-role traversal (Enrollment → Primary Contact → Email), hop trail, cardinality | Relationship picker · Primary Contact selection |
| 03 | [`03-primary-contact-selection.html`](./03-primary-contact-selection.html) | To-many → scalar selection rule (first/each/aggregate) | Primary Contact selection |
| 04 | [`04-metric-picker.html`](./04-metric-picker.html) | OI metric definition (read-only) + EB presentation profile | Metric picker · Analytics placement |
| 05 | [`05-condition-builder.html`](./05-condition-builder.html) | One condition engine; same Browser as left operand; type-aware operators; read-back | Condition Builder |
| 06 | [`06-renderer-picker-contracts.html`](./06-renderer-picker-contracts.html) | Renderer picker filtered by bound type; incompatible greyed with reason | Renderer picker |
| 07 | [`07-analytics-placement.html`](./07-analytics-placement.html) | Definition (OI) vs presentation (EB) split; bands vs band display | Analytics placement |
| 08 | [`08-collection-renderer.html`](./08-collection-renderer.html) | Collection\<T\> + per-item slot template (bindings one level down) | Collection renderer |

## What every mockup proves

1. **Business concepts, not tables** (01, 02) — paths read *Enrollment ▸ Billing ▸ Balance*; technical refs are a faint secondary line.
2. **Relationships are named roles** with cardinality and bounded depth (02), and to-many→scalar forces a selection rule (03).
3. **Definition ⟂ Presentation** for analytics — OI owns the number (violet, read-only), EB owns the picture (04, 07).
4. **One condition engine** sharing the binding Browser, with type-aware operators (05).
5. **Renderers validate by type, not source kind** — invalid pairings are prevented, not errored (06).
6. **Collections reuse the same binding machinery** one level down (08).

## Regenerating the PNGs

```bash
cd /Users/Kelly/Alloy/web
# temp Playwright script using chromium.launch({ channel: "chrome" }), 1320px width, full-page
node playwright/scripts/capture-presentation-data-mockups.mjs
```

The script is temporary and removed after capture.

## Cross-references

| Concern | Doc |
|---|---|
| The model | [`../01-presentation-data-doctrine.md`](../01-presentation-data-doctrine.md) |
| Taxonomy | [`../02-data-taxonomy.md`](../02-data-taxonomy.md) |
| Relationships | [`../03-relationship-architecture.md`](../03-relationship-architecture.md) |
| Analytics split | [`../04-analytics-architecture.md`](../04-analytics-architecture.md) |
| Renderer contracts | [`../05-renderer-contracts.md`](../05-renderer-contracts.md) |
| Condition Builder | [`../06-condition-builder.md`](../06-condition-builder.md) |
| Browser IA | [`../07-data-source-browser.md`](../07-data-source-browser.md) |
