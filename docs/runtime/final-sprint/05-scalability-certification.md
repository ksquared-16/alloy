---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime Scalability Certification
---

# Runtime Scalability Certification — Final Sprint

> **The question:** *"If I go into Settings tomorrow and publish a completely different Focus Panel
> using the existing card archetypes, will the Runtime render it correctly without engineering
> changes?"*

## Direct answer

**It depends on what "different Focus Panel" means — and the honest answer splits cleanly in two:**

1. **Re-composing the EXISTING card types** — different ordering, different placement, different
   span/tier/density, adding/removing/duplicating/hiding/retitling any of the cards the runtime already
   knows, and choosing a different Summary composition from them: **YES — honored today, zero
   engineering. Browser-proven.**

2. **Introducing a genuinely NEW card TYPE** — a card key the runtime has never seen (even if its
   archetype, e.g. `profile`, already exists): **NO — not today.** Three closed sets block it. This is
   the remaining scalability work, and it is precisely scoped below.

## Evidence for (1) — YES, proven live

The org's **currently published** Summary composition is already a custom one, and the runtime honors it
at commit with no code:

- Published doc (v70) order: `[current_work, household, billing_preview, children]` — which **differs
  from the code default** (`current_work, household, children, readiness_kpi, tour, communications,
  documents`). It includes `billing_preview` and drops `readiness/tour/communications/documents`.
- Live runtime: `window.__focusPanelLayoutSource` = `{ docSource: "published-doc", order:
  [current_work, household, billing_preview, children] }` at commit. The runtime rendered exactly the
  published order/placement/set — **billing_preview appeared, the dropped cards did not** — with zero
  engineering.
- Mechanism: composition (which cells, order, span, tier, density, gridRow) is read entirely from the
  published `LayoutDoc` section metadata (`metadata.focusPanelCard.{key,span,tier,density,gridRow}`)
  via `deriveFocusPanelGridFromLayoutDoc` / `deriveFocusPanelSummaryCompositionInputs`. The provisioning
  answer resolves and carries the applicable published doc (this sprint's `fps:`-cached server resolve),
  so it is honored **at commit**, and `composeEffectiveCardModel` applies per-instance config
  (titleOverride, description, density, and — for `profile` cards — field rebinding).

So: **re-ordering, re-placing, re-sizing, and re-composing existing cards is a pure config change.**

## Evidence for (2) — NO, and exactly why

If Product publishes a brand-new key (say `"foo"`, archetype `profile`) tomorrow, it breaks at **three
independent hard stops** — the card silently vanishes, never even reserved:

1. **Closed key allowlist.** `readFocusPanelCardSectionMeta` (`focusPanelLayoutDocModel.ts:102`) calls
   `isFocusPanelCardKey(key)` against the closed const `FOCUS_PANEL_CARD_KEYS`; an unknown key returns
   `null` and the section is skipped — the cell never enters the grid.
2. **Code-only model producer.** Even a whitelisted key yields no model: `buildCardModels`
   (`deriveOpportunityFocusPanelCards.ts:454–760`) hardcodes one bespoke `map.set(...)` block per key.
   No block → `cards.get(key)` is `undefined` → `OpportunityFocusPanelModeGrid` renders
   `ReservedFocusPanelCell` ("Preparing…") **forever**.
3. **Closed TS union + static title map.** `FocusPanelCardKey` is a closed union (won't typecheck) and
   `FOCUS_PANEL_CARD_TITLES` is a static per-key map (blank reserved title otherwise).

The **renderer is NOT the blocker** — `ArchetypeCardBody` already renders `profile / collection / status
/ timeline / launcher` generically from `model.payload`; a new card of those archetypes would render
with zero component code *if it had a model*.

## What "finish it" requires (minimum plan, scoped, not done this sprint)

To make a new published card of an **existing archetype** render with zero code:

1. Open `FocusPanelCardKey` from a closed union to `string` (branded) — `focusPanelCardModel.ts:84–129`.
   **Wide blast radius** (every switch/map keyed by the union) — the main risk, why it is not done
   pre-freeze.
2. Relax the read gate `focusPanelLayoutDocModel.ts:102` to accept any non-empty string key (keep the
   span/density/tier validation).
3. Add a **config-driven model fallback**: where `cards.get(typeKey)` is `undefined`
   (`OpportunityFocusPanelModeGrid.tsx:525`), synthesize a generic `card({ key, archetype, title,
   insight, payload })` from the published section's metadata/config instead of reserving — extend the
   `composeEffectiveCardModel` `profile` field-binding seam to also populate
   `collectionItems/statusIssues/timelineEvents/launcherRows` for those archetypes.
4. Mark the synthesized card `ready` (`focusPanelWorkModeModelFromDrawerVm.ts:60–63`).
5. (cosmetic) Derive the reserved title from the section title (`humanizeCardKey`).

With 1–4, a new `profile`/`collection`/`status`/`timeline`/`launcher` card flows read-gate → grid →
synthesized model → `composeEffectiveCardModel` → `ArchetypeCardBody` → renders. **Zero per-card code.**

## Archetype vocabulary mismatch (also finish-it work)

The doctrine's archetypes — Summary, Truth, Guidance, Relationship, Workspace, Timeline, Communication,
Intelligence, Documents — do **not** map 1:1 to the current `system5` set (action, status, summary,
profile, collection, metric, timeline, launcher). "Communication", "Documents", "Workspace",
"Intelligence" have no `ArchetypeCardBody` branch; `summary/action/metric` render header-only (no body).
A new card of those archetypes needs one **generic per-archetype body** each (a handful, one-time — not
per-card). Reconciling the two vocabularies is part of the archetype rewrite.

## Certification verdict

- **Different ordering / placement / Summary composition of existing cards:** **CERTIFIED — honored with
  zero engineering** (live-proven).
- **A genuinely new published card type:** **NOT CERTIFIED** — blocked by the three closed sets;
  minimum plan above. This is the one remaining scalability gap for Runtime V1.
