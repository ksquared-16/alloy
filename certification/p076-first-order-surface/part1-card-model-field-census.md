# P0-7.6 Part 1 — Focus Panel card model field census

Run: erun_83d14272c1e5fb88 · Lane: lane_73a897409906

Question: for every field of `FocusPanelCardModel`, across the six CONFIGURED collapsed cards,
what is its CURRENT source?

Codes: **A** configuration · **B** canonical first-order fact · **C** derived presentation from
first-order facts · **D** action definition / eligibility · **E** drawer/detail-only fact ·
**F** legacy accidental dependency · `—` field not set (undefined)

## Producers

All six cards are already registry-declared. Neither registry takes the Drawer View Model.

| card | registry | builder | fact input |
|---|---|---|---|
| business_process | `COMMIT_CRITICAL_CARD_SPECS` | `buildBusinessProcessCardModel()` — **no arguments** | gate only: `businessProcess.stageKey` |
| household | `COMMIT_CRITICAL_CARD_SPECS` | `buildHouseholdCardModel(context.truth, context.subject.label)` | `context.truth` |
| children | `COMMIT_CRITICAL_CARD_SPECS` | `buildChildrenCardModel(context.truth)` | `context.truth._inquiry_children` |
| attendance | `MOUNTABLE_CARD_SPECS` | `buildSelfFetchingCardShell` | gate only: `participantScope.customerMemberId` |
| health_safety | `MOUNTABLE_CARD_SPECS` | `buildSelfFetchingCardShell` | gate only: same participant identity |
| financials | `MOUNTABLE_CARD_SPECS` | `buildSelfFetchingCardShell` | gate only: `HOUSEHOLD_IDENTITY_TRUTH_KEYS` |

`card()` (deriveOpportunityFocusPanelCards.ts:67) defaults three fields from **pure key-keyed
configuration tables**, with no facts at all:

- `archetype` ← `SYSTEM5_CARD_ARCHETYPE[key]`
- `iconName`  ← `SYSTEM5_CARD_ICON[key]`
- `primaryAction` ← `SYSTEM5_DEFAULT_CARD_ACTIONS[key]`

## The table

| field | business_process | household | children | attendance | health_safety | financials |
|---|---|---|---|---|---|---|
| `key`            | A | A | A | A | A | A |
| `archetype`      | A `action` | A `profile` | A `collection` | A `timeline` | A `status` | A `summary` |
| `title`          | A literal | A literal | A literal | A catalog | A catalog | A catalog |
| `insight`        | A `""` | C | C | A `""` | A `""` | A `""` |
| `tier`           | A `work` | A `reference` | A `reference` | A `work` | A `work` | A `work` |
| `span`           | A 1 | A 2 | A 2 | A 2 | A 2 | A 2 |
| `density`        | A compact | A compact | A compact | A compact | A compact | A standard |
| `statusChip`     | — | — | — | — | — | — |
| `statusTone`     | — | — | — | — | — | — |
| `primaryAction`  | A null | A "View household →" | **D** | A null | A null | A null |
| `secondaryInsight` | — | — | C | — | — | — |
| `iconName`       | A | A | A | A `Clock` | A `HeartPulse` | A `DollarSign` |
| `payload`        | — | C | C | — | — | — |
| `visible`        | A true | A true | A true | A true | A true | A true |

### The C and D cells, in full

- **household.insight** — `resolveLeadDrawerCommandHeaderMeta(truth, title).contactRow ?? .metaRow
  ?? "Primary contact on file"`.
- **household.payload.profileFields** — flat truth keys `person.primary_contact_name`,
  `person.secondary_contact_name`, `person.primary_phone`, `person.secondary_phone`, `person.*_email`,
  plus `_identity.primary_person.label` as a fallback.
- **children.insight / .secondaryInsight** — `normalizeFocusPanelChildrenRowsFromTruth(truth)`, a
  count of non-`declined` rows.
- **children.payload.collectionItems** — first N of the same rows.
- **children.primaryAction** (the one D) — eligibility is `items.length > 0`, a count over the
  same first-order rows. Label and variant are static.

## Findings

1. **Zero E cells and zero F cells.** No field of any of the six configured cards reads the Drawer
   View Model. The previous run's conclusion — that the collapsed card model is entangled with the
   drawer VM — was WRONG, and is retracted here. It generalised from the 47-reference renderer
   census and from `buildCardModels`'s signature; the drawer-VM-dependent cards
   (`attention`, `current_mission`, `communications`, …) are not in this configured set.
2. **Four of six cards are 100% configuration.** `business_process`, `attendance`, `health_safety`
   and `financials` carry `insight: ""` and no payload; their builders take no facts whatsoever.
3. **The only facts any configured card needs are `context.truth` and `context.subject.label`** —
   a flat record, for two cards.
4. **`statusChip` / `statusTone` are unused across all six.** They are not first-order fields for
   this configuration.
5. **`children` reads `truth._inquiry_children`, not `document_children`.** The collapsed children
   card has no document_children dependency at all. (Carried to Part 10.)
6. **The generic compilation seam already exists.** `COMMIT_CRITICAL_CARD_SPECS` and
   `MOUNTABLE_CARD_SPECS` are both `{key, predicate(context), build(context)}` and are already
   iterated with no per-card branching (`focusPanelWorkModeModelFromProvisioningAnswer.ts:231`).
   Parts 6–7 are a REBIND of that seam's fact input onto A′, not a new architecture.
