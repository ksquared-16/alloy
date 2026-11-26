# Surface Builder V2 — make the builder feel like a product

The architecture, runtime, and persistence are correct. The remaining problem is **UX**. This is a product-design sprint, not an engineering one: make the Surface Builder feel like the best part of Alloy — closer to Figma / Framer / Linear / Notion than to Salesforce Setup.

**No new features, backend, persistence, APIs, renderers, or calculations.** Everything exists; we fix the experience.

## North star
A first-time operator opening **Settings → Surfaces → Operational Intelligence** should never have to ask:
*Where is the preview? · How do I add another card? · Did Publish work? · What did Publish do? · What am I editing?*
The builder answers all five before they're asked.

## Deliverables
- **Mockups** ([`mockups/`](mockups/)) — every interaction and state:
  - [`01-builder.html`](mockups/01-builder.html) — the three panes: Section Tree · Live Canvas (the preview) · Inspector, with a selected card.
  - [`02-add-card.html`](mockups/02-add-card.html) — inline contextual insertion: type → content → configure.
  - [`03-publish-and-modes.html`](mockups/03-publish-and-modes.html) — Editing/Preview/Runtime modes + the Draft → Saving → Published → Runtime-updated lifecycle.
  - [`04-inspector-and-states.html`](mockups/04-inspector-and-states.html) — the five inspector groups + empty / hover / selected states.
- **Walkthrough** ([`walkthrough.md`](walkthrough.md)) — open → add → configure → publish → view runtime, with the five questions answered.
- **Implementation plan** ([`implementation-plan.md`](implementation-plan.md)) — UI-only changes mapped to the existing components, in three small presentational PRs.

## The eight UX fixes
1. The canvas **is** the preview — every inspector edit renders instantly.
2. The left panel owns **Sections**; cards live inside them.
3. **Add card** is one inline flow (type → content → configure), never a wizard or a page.
4. **Publish** shows confidence: Draft · Saving · Published · Runtime updated, with Open Runtime.
5. **Editing / Preview / Runtime** are always explicit.
6. The **Inspector** has hierarchy: Card · Content · Renderer · Behavior · Placement (Promote → Placement).
7. Selection is immediate — ring, scroll-into-view, tree + inspector co-highlight.
8. Empty sections **teach themselves**.

This is the last UX convergence before SurfaceBuilder scales across the rest of Alloy.
