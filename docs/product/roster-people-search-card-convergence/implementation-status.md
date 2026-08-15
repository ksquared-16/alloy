---
owner: product
status: sprint
last_reviewed: 2026-08-15
sprint: roster-people-search-card-convergence (slot 1)
base: origin/staging @ 11df0cdce
supersedes: []
---

# Implementation status — Roster People + Search + Contextual Card Convergence

**IN PROGRESS — slices 1–6 and 8 landed; 7, 9 and browser certification open.**

PR [#436](https://github.com/ksquared-16/alloy/pull/436), branch
`agent/claude/1-roster-people-search-card-convergence`, on `origin/staging @ 11df0cdce`.

**This sprint is NOT accepted.** The core convergence is built and unit-proven; three things the
acceptance criteria require are not done, and they are named precisely below.

---

## What is built and proven

| Slice | State | Proof |
|---|---|---|
| 1 — one subject-context authority | **landed** | 9 projection tests; Search 145/145 unchanged |
| 2 — Search record vs operational intent | **landed** | 22 conflation tests rewritten, none deleted; picker regression pinned |
| 3 — in-workspace durable record host | **landed** | structural (workspace never unmounts) |
| 4 — contextual card resolution | **landed** | 8 equality tests incl. a non-vacuity guard |
| 5 — Records re-home + visual convergence | **landed** | section/deep-link/deletion tests |
| 6 — Child edit through one authority | **landed** | 12 write-authority tests |
| 8 — Staff contextual convergence | **landed** | employment + staff assignment in the shared projection |
| 7 — durable Household | **NOT STARTED** | — |
| 9 — Employment edit wiring | **NOT STARTED** | — |
| Browser certification | **NOT RUN** | — |

CI green on every required check through slice 6.

## The invariant, and how it is held

> same subject + same business context + same stage/state ⇒ the same effective configured card.

It holds because there is nothing to disagree with. Both hosts resolve the configuration through the
same two functions — `effectiveChildrenNestedConfig` then `childrenFocusRowsFromNestedConfig` —
against the same `entity_layouts` row, selected by the same `resolveSurfaceVariant` from the same
addressing tuple `(businessProcessKey, workViewId, stageKey, statusKey)`.

`tests/context/contextualCardEquality.test.ts` asserts the fingerprint — field keys, configured
labels, order, visibility, editability — is IDENTICAL, against a publication deliberately unlike the
platform default so a silent fallback to the default is visible rather than plausible. It also reads
`ChildrenCard.tsx` to confirm the native card still resolves through those same functions; without
that, the value compared is no longer the one an operator sees.

**R9 was not touched, and should not be.** A tenant still cannot publish a child-grain whole surface.
The target never needed one: it needed the durable host to resolve the EXISTING Enrollment/Waitlist
configuration, which is addressable without a subject.

## What is NOT done

### 1. Browser certification — none of the 13 artefacts

Nothing has been exercised in a browser. Everything above is unit-level and source-level. In
particular these are **unproven in a running product**:

- that Roster → Children → Lennon actually opens the record over a mounted Roster
- that the cohort, page offset, filter, site and scroll survive open → close
- that the equality attributes (`data-contextual-card-layout-id`, `-version`, `-fingerprint`)
  match between the durable host and the native Waitlist Focus Panel **against real data**
- that an edited value appears in the native Focus Panel afterwards
- that Search's record result and work result go where they now claim to

The DOM hooks for all of it are in place (`data-durable-record-*`, `data-contextual-card-*`,
`data-records-cohort-*`). What is missing is the run.

### 2. Slice 7 — durable Household

Not started — but the STOP CONDITION IS ANSWERED, and it is negative. A durable Household does **not**
require copying case-only truth, and does not need a second family model.

The evidence is in `buildOpportunityFamilyContactRows`
(`lib/admin/drawer/opportunityFamilyContactsOrdering.ts:82`). It reads two sources, not one:

- `_opportunity_persons` — case-scoped, and merely the FIRST source
- `_customer_persons` — the canonical household edge, filtered by `customer_id`, producing complete
  contact rows (`person_id`, `role_type`, `name`, `phone`, `email`, `photo_url`) with no case
  involved at all

The second branch is self-sufficient. Its own comment already anticipates the durable case — "a
household guardian arriving via `_customer_persons` while shell `_opportunity_persons` is frozen" —
so a composer that supplies only the household edge yields real contacts, not an empty card.

The one place to be careful is CHILDREN. `record._inquiry_children` is OCM-shaped, and a household's
children are `customer_members` (which `childCohortQuery` already projects per household). The
composer must supply them from `customer_members` and NOT shape them into `_inquiry_children` —
shaping household truth into a case-shaped key is precisely the copying the stop condition forbids,
and it is avoidable rather than inherent.

So Slice 7 is unblocked. What it needs, in order:
`composeDurableHouseholdSubject` → `"household"` added to `DurableSubjectType` /
`OperationalSubjectType` / `KNOWN_GRAINS` → a `grains` declaration on the existing `household` card
(it carries none, so it is case-only by the silence rule) → the household branch of
`resolveSubjectDestination` becomes a `durable_record` like child and person, at the spot already
marked in that file.

### 3. Slice 9 — Employment editing

Not started, and bounded exactly as the audit found it: `employmentService` holds full write
authority (`createEmployment`, `updateEmployment`, `endEmployment`), and the Employment card exposes
none of it (`primaryAction: null` on both person-grain cards). Display and navigation are correct;
editing is absent. No HRIS was built.

## Honest gaps inside what DID land

These are properties of the design, not bugs, and each is stated in the code that causes them.

- **Enrollment projections are unset on a durable host.** Program, room, schedule type and start date
  live on the OCM row. A durable host that has not loaded participation shows them unset. The rows
  are present, configured and ordered — same card, facts this host has not fetched. Fabricating them
  would invent participation.
- **They are also not editable there**, for the same reason, and `writeTargetForField` says so with
  the enrollment-specific message rather than a generic refusal.
- **Assignment and Employment contexts resolve no configured card.** They have no business process,
  so there is no published composition. The card states this instead of approximating one.
- **The durable host does not commit a Work View.** It passes the context's stage-bound or
  membership-proven `workViewId` when configuration supplies one. Every published Focus Panel doc is
  org-global today, so this cannot change the resolved document yet — but it will matter the first
  time a tenant publishes a Work-View-scoped variant, and it is the axis to check first if equality
  ever fails.

## Defects found and fixed while building

- A restated stage→Work-View cache key (`${opp}::${stage}` vs the canonical `${opp}:${stage}`) that
  would have compiled and answered null forever, silently costing every child its stage-bound view.
- A `locations` read selecting a `name` column that does not exist on that table.
- `writeTargetForField` classifying by the inline-save list, so an enrollment field was refused as
  "not editable" instead of "edited in the enrollment" — same refusal, wrong reason, and the wrong
  reason is what the operator would have read.
- Four type errors CI caught that this host cannot (`npm run typecheck` exits 144 here).

## Where to resume

1. Browser certification — the highest-value remaining work, because everything above is currently
   an argument rather than an observation.
2. Slice 7, then Slice 9.
