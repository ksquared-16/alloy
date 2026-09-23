# P0-7.6 Parts 3–7 — the generic first-order seam ALREADY EXISTS

Run: erun_83d14272c1e5fb88 · Lane: lane_73a897409906

The dispatch asks this lane to BUILD a generic card presentation seam that produces the collapsed
Focus Panel card model without the Drawer View Model or `document_children`. The census in Parts 1
and 2 found that seam already built. These are its parts, against the questions asked.

## Part 3 — collapsed payload contract

**The contract is empty.** No configured card reads `model.payload` (Part 2, verified negative).
`payload` is produced for `household` and `children` and never consumed. The narrow collapsed
payload contract is therefore: **no payload field at all.**

## Part 4 — action census

| card | `primaryAction` at collapsed | source | verdict |
|---|---|---|---|
| business_process | null | — | FIRST_ORDER_RESOLVABLE |
| household | "View household →" / secondary | `SYSTEM5_DEFAULT_CARD_ACTIONS` | FIRST_ORDER_RESOLVABLE (static) |
| children | "View all →" if rows>0 | static label + count eligibility | FIRST_ORDER_RESOLVABLE |
| attendance | null | — | FIRST_ORDER_RESOLVABLE |
| health_safety | null | — | FIRST_ORDER_RESOLVABLE |
| financials | null | — | FIRST_ORDER_RESOLVABLE |

Zero REQUIRES_STAGE_2. And none of it is consumed: the six components render their own footers.
Label and variant are key-keyed configuration; the only eligibility input is a count over truth.
**Authorization is not read at collapsed paint by any configured card.**

## Part 5 — existing presentation authority (reuse, do not reinvent)

| concern | authority | shape |
|---|---|---|
| archetype | `system5CardArchetypes.ts` → `SYSTEM5_CARD_ARCHETYPE` | `Record<CardKey, Archetype>` |
| icon | `system5OperationalSurfaceSpec.ts` → `SYSTEM5_CARD_ICON` | `Record<CardKey, string>` |
| default action | `system5OperationalSurfaceSpec.ts` → `SYSTEM5_DEFAULT_CARD_ACTIONS` | `Partial<Record<…>>` |
| title | `focusPanelCardCatalog.ts` → `focusPanelCardCatalogLabel(key)` | key → label, alias-aware |
| tier → role | `SYSTEM5_TIER_TO_ROLE` | `Record<Tier, Role>` |
| footer suppression | `system5ArchetypeSuppressesFooterAction(archetype)` | archetype law |
| tier/span/density | literals in the per-card builders | — |
| content admission | `focusPanelCommitCriticalCards.ts` → `COMMIT_CRITICAL_CARD_SPECS` | `{key, isKnowable, build}` |
| mount admission | `focusPanelMountableCards.ts` → `MOUNTABLE_CARD_SPECS` | `{key, identityTruthKeys, identityKnowable, build}` |

All key-keyed. None fact-dependent. **Nothing here needs to be invented.**

## Part 6 — `FirstOrderFocusPanelCardModel`, minimum

The union of every field the configured collapsed surface consumes (Part 2) is eight:

```ts
type FirstOrderFocusPanelCardModel = {
    key: FocusPanelCardKey;
    title: string;
    archetype: FocusPanelCardArchetype;
    tier: FocusPanelCardTier;
    span: FocusPanelCardSpan;
    density: FocusPanelCardDensity;
    iconName: string;
    visible: boolean;
};
```

Six of the fourteen current fields are droppable at first paint: `insight`, `secondaryInsight`,
`payload`, `statusChip`, `statusTone`, `primaryAction`. All six are unread by the configured set.

**Every one of the eight is class A CONFIGURATION.** The first-order card model carries no facts.
Facts reach the card through `context` and through the card's own read — which is the separation
the dispatch demands, already in force.

## Part 7 — generic compilation

`focusPanelWorkModeModelFromProvisioningAnswer.ts:220–252` is the compiler, and it is already
generic — two loops, **no per-card branching anywhere**:

```
context = buildCommitCriticalOperationalContext(input)
for spec of COMMIT_CRITICAL_CARD_SPECS:  if isKnowable(context)        -> build, "ready"
for spec of MOUNTABLE_CARD_SPECS:        if identityKnowable(context)  -> build, "self_loading"
```

Content readiness wins; mountability can only fill a gap. There is no `if (cardKey === …)` in the
compiler. It performs **no database reads**: it is a pure function of the provisioning answer.

## The consequence for the programme

`OpportunityFocusPanelBody.tsx:254` already prefers `enriched` (settled) but **falls back to
`commitCritical`**, so the surface paints from the provisioning answer alone when settlement has
not arrived. `commitCritical` is gated only on `operationallyResolved || structurallyResolved`
(`InlineOpportunityFocusPanel.tsx:713`).

So the collapsed first-order surface is **not blocked on the Drawer View Model or on
`document_children`** — it is bounded below by the **provisioning answer resolve time** and
nothing else.

That relocates the remaining P0-7.6 gap. It is not an architecture gap. The previously measured
server compute floor of **1,194 ms** (154 + 919 + 121) against a target of <900 ms in prototype
and <1,000 ms deployed is the whole of the remaining problem, and it lives in the provisioning
answer, not in card presentation.

### Retraction

The prior run (`erun_fa7801ac0671b4e0`) concluded the collapsed card model was entangled with the
Drawer View Model and that a new seam was required. That conclusion was wrong and is withdrawn. It
generalised from `buildCardModels`'s signature and from a renderer census that counted the generic
body path — a path **no configured card reaches**.
