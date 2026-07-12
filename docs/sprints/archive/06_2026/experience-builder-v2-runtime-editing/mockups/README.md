# Experience Builder V2 — Mockups (Runtime Editing)

**Deliverable 6.** High-fidelity HTML mockups expressing the "editable runtime" model. Each `.html` renders standalone (open in a browser); a captured `.png` sits beside it for quick viewing.

> **Visual contract:** these mockups deliberately reuse the Alloy runtime visual language (pine `#00a283`, midnight `#1a2332`, stone, white-canvas, emerald gradient, 6 typography tiers). The whole point of this sprint is that **the editing surface is visually identical to the published surface** — so the mockups draw the *real* runtime and only add the Edit Bar + affordances on top.

## Index

| # | File | Demonstrates | Deliverable mapping |
|---|---|---|---|
| 01 | [`01-edit-mode-entry.html`](./01-edit-mode-entry.html) | Viewing → Editing on the same surface; the Edit Bar is the only new chrome | Edit Mode entry |
| 02 | [`02-structure-mode.html`](./02-structure-mode.html) | Structure Mode: zone boundaries, drag handles, resize, dimmed content | Structure Mode |
| 03 | [`03-card-insertion.html`](./03-card-insertion.html) | Card insertion between cards via inline Card Type picker | Card insertion |
| 04 | [`04-card-movement.html`](./04-card-movement.html) | Card movement: lift, reflow, drop-target ghost | Card movement |
| 05 | [`05-content-mode-renderer.html`](./05-content-mode-renderer.html) | Content Mode: inline slot editor, renderer catalog, data source, field editing | Renderer editing · Field editing |
| 06 | [`06-dashboard-analytics.html`](./06-dashboard-analytics.html) | Dashboard/Analytics editing — identical Edit Bar & modes; only Card Types/Renderers differ | Dashboard editing · Analytics editing |
| 07 | [`07-queue-row-editing.html`](./07-queue-row-editing.html) | Editing the 52px row inside the actual queue, same inline gestures | Queue Row editing |
| 08 | [`08-mobile-editing.html`](./08-mobile-editing.html) | Mobile editing as a responsive lens of one surface | Mobile editing |
| 09 | [`09-working-copy-vs-published.html`](./09-working-copy-vs-published.html) | Runtime states (Preview removed), on-surface diff, History + Restore | Working Copy vs Published |
| 10 | [`10-empty-states.html`](./10-empty-states.html) | Empty surface, empty zone, empty slot — empty ≠ disabled | Empty states |
| 11 | [`11-browse-and-publish.html`](./11-browse-and-publish.html) | Browse & Manage IA (Category→Domain→Surface) + Publish impact analysis | IA (secondary entry) · Publish flow |

## What every mockup proves

1. **One surface, two states.** The runtime is identical in Viewing and Editing; only affordances are added (compare 01 top vs bottom).
2. **One chrome.** A single slim **Edit Bar** — no queue/tree/inspector triptych.
3. **Two modes.** Structure (02–04) vs Content (05–07) are visually and behaviorally distinct.
4. **Inline everything.** Editors are anchored to the element and dismiss on deselect (05, 07).
5. **Insert between cards.** The `+`-line + inline Card Type picker (03), never a side panel.
6. **Analytics is identical.** Same Edit Bar/modes for dashboards (06).
7. **Preview is gone.** Runtime states + on-surface diff + History (09).
8. **Scalable, inheritance-aware IA.** Category→Domain→Surface, scope filter, override/default markers (11).

## Regenerating the PNGs

PNGs were captured with a temporary Playwright script using the system Chrome channel (Playwright's bundled Chromium is not installed in this environment). To regenerate:

```bash
cd /Users/Kelly/Alloy/web
# temp script launches chromium.launch({ channel: "chrome" }), loads each file:// mockup at 1440px width, screenshots full page
node playwright/scripts/capture-eb-v2-mockups.mjs
```

The script is temporary and removed after capture — recreate it pointing `file://` URLs at the mockups in this folder.

## Cross-references

| Concern | Doc |
|---|---|
| Interaction model | [`../01-runtime-editing-interaction-model.md`](../01-runtime-editing-interaction-model.md) |
| Edit Mode / Structure / Content doctrines | [`../03-edit-mode-doctrine.md`](../03-edit-mode-doctrine.md), [`../04-structure-mode-doctrine.md`](../04-structure-mode-doctrine.md), [`../05-content-mode-doctrine.md`](../05-content-mode-doctrine.md) |
| Walkthroughs | [`../06-interaction-walkthroughs.md`](../06-interaction-walkthroughs.md) |
| Critique of prior mockups | [`../07-design-critique.md`](../07-design-critique.md) |
