---
owner: platform
status: active
last_reviewed: 2026-07-19
---

# Runtime Scalability Review — Published Focus Panel Composition

**Question:** If Product publishes a completely different Focus Panel tomorrow — different cards,
different order, different placement, different Summary composition — will the Runtime simply honor it?

**Answer: PARTIALLY. Not yet fully.**

> UPDATE (session 2026-07-19b): the published Summary doc is now COMMIT-CRITICAL — resolved
> server-side into the provisioning answer (`fps:` config-cached, publish/rollback/delete
> invalidated) and seeded to the doc provider, so the committed first frame IS the published
> composition (`a70bd8255`). **Gap 4 below is closed for the existing card set**: the producer
> derives its ready set from the declared `COMMIT_CRITICAL_CARD_SPECS` registry (`cc6930d43`).
> Gaps 1–3 (a BRAND-NEW published card type without code) remain open.

## What the runtime DOES honor from the published doc

- **Which cells appear + their order + placement + span/geometry** for Summary mode come from the
  published Focus Panel Summary `LayoutDoc` via `usePublishedFocusPanelSummaryDoc` →
  `deriveFocusPanelInstanceMap` / `deriveFocusPanelGridFromLayoutDoc` /
  `deriveFocusPanelSummaryCompositionInputs`. After this session, composition is configuration-driven:
  every published cell renders (readiness decides content), so re-ordering / re-placing / adding-or-
  removing an EXISTING card type in the published doc is honored with no engineering.
- **Per-instance config** (`FocusPanelCardConfig`) is applied via `composeEffectiveCardModel`.

## What still depends on HARDCODED behavior (the gaps)

1. **Card MODELS are hardcoded per key.** `deriveOpportunityFocusPanelCards.ts` `buildCardModels`
   contains a `map.set("<key>", card({...}))` block per card type, with hardcoded title, tier, span,
   insight logic, and which record/signal fields each reads. A published card type that has no
   `map.set` block produces no model → the grid reserves it forever. **A brand-new card type cannot be
   published without code.**
2. **The RENDERER is a hardcoded per-key switch.** `FocusPanelCardRenderer.tsx` routes each card key to
   a specific component (`HouseholdCard`, `ChildrenCard`, `CurrentWorkCard`, …). A new key falls
   through to the generic archetype body only if its archetype/payload is set; bespoke card behavior is
   per-component, not archetype-driven.
3. **Card DATA reads are hardcoded per card.** Each evidence builder
   (`buildHouseholdCardEvidence`, `buildChildrenCardEvidence`, …) reads specific `context.truth` keys /
   `context.signals` fields. The commit-critical producer must know, per card, which keys to populate
   (this session hardcodes Household + Children). A published card needing a new field requires the
   provisioning answer + producer to learn that field.
4. **The commit-critical producer hardcodes the ready set.** `focusPanelWorkModeModelFromProvisioningAnswer`
   explicitly builds `current_work` / `household` / `children` models and marks them ready. It does not
   yet derive "which published cards are knowable at commit" from the composition + the answer snapshot.
5. **Work/Activity mode grids are code constants** (`WORK_GRID_*`, `ACTIVITY_GRID` via
   `resolveFocusPanelModeGrid`); only Summary is published-doc driven.

## What "fully honor published config" requires (for the next session)

- Move card rendering to **archetype + published placement**: a card is `{ archetype, dataBindings,
  placement }`; the renderer dispatches on archetype; data bindings declare which `context` fields the
  card reads; the commit-critical producer marks a card ready when its declared commit-critical
  bindings are satisfiable from the answer/snapshot. No per-key `map.set`, no per-key renderer switch.
- Then a new published Summary composition (new cards, order, placement) is honored with zero
  engineering, and "Summary is the first committed experience; detail is Settlement" follows from the
  archetype's committed-vs-settlement binding classification.

**Conclusion:** the COMPOSITION (layout) is published-driven; the CARD BEHAVIOR/DATA is still hardcoded
per card type. Runtime will honor a re-arranged Summary of the EXISTING cards today; it will NOT honor a
genuinely new published card without code. Closing gaps 1–4 is the scalability work for Runtime V1.
