---
owner: product
status: sprint
last_reviewed: 2026-08-15
sprint: roster-people-search-card-convergence (slot 1)
base: origin/staging @ 11df0cdce
supersedes: []
---

# Implementation status — Roster People + Search + Contextual Card Convergence

**IN PROGRESS — slices 1–8 landed and browser-certified; 9 DEFERRED with a report.**

PR [#436](https://github.com/ksquared-16/alloy/pull/436), branch
`agent/claude/1-roster-people-search-card-convergence`, on `origin/staging @ 11df0cdce`.

**This sprint is NOT accepted.** The convergence is built and browser-proven at **12 of 13**
certification scenarios. The single failure and the single deferral are both named precisely below,
and neither is a product defect.

---

## What is built and proven

| Slice | State | Proof |
|---|---|---|
| 1 — one subject-context authority | **landed** | 9 projection tests; Search 145/145 unchanged |
| 2 — Search record vs operational intent | **landed** | browser: both paths, side by side |
| 3 — in-workspace durable record host | **landed** | browser: Roster stays mounted underneath |
| 4 — contextual card resolution | **landed** | browser: durable side vs a deliberately non-default publication |
| 5 — Records re-home + visual convergence | **landed** | browser: four sections, deep links, deletion |
| 6 — Child edit through one authority | **landed** | browser: the full edit → save → close → return journey |
| 7 — durable Household | **landed** | browser: both entries, compared rather than each merely asserted |
| 8 — Staff contextual convergence | **landed** | browser: same person, same contexts, from both entries |
| 9 — Employment edit wiring | **DEFERRED** | scoped below — a new surface, not a wiring job |
| Browser certification | **12 / 13** | the one failure is the recorded limitation below |

CI green on every required check through slice 6.

## Two things a reader should not have to discover twice

**1. The cert tenant's participation spine is gone.** `process_instances` holds **2 rows** for the
entire tenant, and both belong to this sprint's own fixture — against 3001 opportunities, 1502
children and 1801 household adults, all intact. This branch did not cause it, and it is not confined
to this branch: four scenarios of the already-merged `search-operational-destinations.cert.spec.ts`
now fail on code this branch never touched, because the child they assert against
(`Quinn Testfamily-0284`) has no participation and therefore no truthful Work View membership.
Anything in this repository that certifies operational cohorts is currently unprovable in this
tenant. **Check that before diagnosing your own branch.**

**2. `npm run typecheck` cannot run on this host, and a browser is not a substitute.** Widening
`OperationalSubjectType` for the durable household left two switches non-exhaustive. They returned
`undefined`, so the surface composed a grid with no areas: a ready card model, a blank panel, no
error. CI would have failed the build; here it took a browser run to see it. Walk the switches by
hand whenever a subject union is widened, until CI has seen the branch.

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

### 1. Browser certification — 12 of 13, RUN

`certification/playwright/roster-people-search-convergence.cert.spec.ts`, evidence under
`certification/evidence/roster-people-search-convergence/`. Every item this section previously listed
as unproven is now observed:

| | Scenario | State |
|---|---|---|
| A | Roster → Children → Lennon opens the record over a Roster that is still mounted | pass |
| B | the context strip offers the contexts Lennon actually holds | pass |
| C | the durable host renders the CONFIGURED Child card and names the document | pass |
| E | the native Waitlist panel resolves the same configuration | **fail — see 1b** |
| H | the RECORD result opens the durable record and commits no lens | pass |
| I | the OPERATIONAL result composes a real work surface | pass |
| J | Roster → Staff → Jane and Search → Jane reach the same durable Person | pass |
| K | Roster holds four sections; no separate Records workspace; old deep links land | pass (×2) |
| L | Lennon → Household → Kurzman Family opens the durable family | pass |
| M | Search → Kurzman Family opens the SAME composition | pass |
| N | edit → save → card refreshes → close → identical Roster → same value elsewhere | pass |

Two assertions were deliberately strengthened after they passed vacuously, and both are worth
remembering: scenario I asserted only the URL, which a blank page satisfies — and was satisfying;
scenario M compared composed card text while both sides were empty. Absence is not arrival, and
equality between two nothings is not equality.

### 1b. The native half of the equality proof — BLOCKED BY TENANT CONFIGURATION

Cold entry was never the cause. A diagnostic compared `?subject_id=` cold entry against a manual
row click; both fail identically, and the runtime states why:

> "This Work View can't be shown until its configuration is fixed. stage "waitlist" offers no
> reachable primary action — the answer will not claim operational on identity alone"

The lens terminates in a CONFIGURATION error and renders **zero rows**, so cold entry finds no
subject and the manual click has no row to click. `subject_id` parsing, the provisioning seed and
the subject-commit seam are never reached. The refusal is correct: the runtime declines to claim a
surface is operational on identity alone.

Not stage-specific — `tour` gives the identical refusal. The stages *do* carry operating plans in
`lifecycle_builder_v1`, so the actions are **authored but not reachable**, the state this tenant
already has on record (a RegisteredAction is unreachable until it is also in
`capabilityRegistry.ts`).

**Classification: pre-existing tenant/capability configuration.** Not a product defect, not a
deep-link gap, not a regression — this branch changes nothing on that path. Authoring reachable
stage actions is Work View / lifecycle configuration and is out of bounds for this sprint.

**Consequence:** the native operational Focus Panel cannot compose for enrollment in this
certification tenant, so `data-children-card-fingerprint` cannot be read here by ANY route — URL or
operator interaction. The native half is blocked by tenant state, not by the implementation. The
durable half passes for the same subject and context against the non-default publication.

Closing this needs a tenant whose enrollment stages have reachable primary actions.

**ADDENDUM — the diagnosis above was correct but not complete, and the missing half is larger.**
The stage-action refusal is real. Underneath it, `process_instances` holds **2 rows for the whole
tenant**, both belonging to this fixture. So the lens renders zero rows for a second, simpler reason:
there is nothing to row. This also explains why every Work View pill on the fixture's own unit reads
`0`, and why the merged `search-operational-destinations` certification now fails on untouched code.

Closing the native half therefore needs **both**: reachable stage actions AND a participation spine.
Neither is authored by this sprint, and neither is a product defect.

### 2. Slice 7 — durable Household — **DONE**, and the plan below is what was built

The order recorded here was followed exactly. The one thing the plan did not anticipate is recorded
in "Two things a reader should not have to discover twice" above: widening `OperationalSubjectType`
silently broke two exhaustive switches, and the card composed into a grid with no cells.

The historical plan is kept below because its REASONING is what made the slice small.



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

### 3. Slice 9 — Employment editing — DEFERRED, and here is the scope that decided it

The instruction was "wire the existing employment authority into the contextual Employment card, and
defer if it expands materially". It expands materially. The word doing the work in the original
assessment was **"wire"**, and the assumption under it — that the authority is exposed and merely
needs a caller — does not hold.

`employmentService` does hold full write authority (`createEmployment`, `updateEmployment`,
`endEmployment`). **All three have zero callers outside `lib/employment`.** There is no API route, no
registered capability, no command. So "wiring" would mean building, at minimum:

1. **A write seam that does not exist** — a route or command, with permission enforcement authored
   from scratch. Access & Identity V2 has this repository at 3 of 548 routes enforcing permissions;
   a new mutating route is exactly where that debt must not be added to silently.
2. **An editability model for a card that has none.** The Employment card is `primaryAction: null` at
   both grains, and its own docblock says why: "Add / Edit / End employment are operator capabilities
   elsewhere; offering them here would be a second execution path for one capability." Reversing that
   is a product decision, not an implementation detail.
3. **An edit affordance and save path on a pure-read card.** Slice 6 built exactly this for the Child
   card; that was a slice, not a wiring step.
4. **A transaction/compensation story** under the Platform Transaction Contract, because employment
   writes have downstream coverage effects (`employmentCoverage`).

That is a new editable surface. Per the sprint instruction it is deferred rather than half-built, and
**Staff display and navigation convergence are kept and browser-certified** (scenario J: Roster →
Staff → Jane and the same person from Search open the same durable Person with the same context
count, with Employment composing "Lead Teacher" as the positive control).

**A finding that will land on whoever picks this up.** Slice 6's browser run showed that a card row is
offered for edit only when `isChildFocusFieldSaveSupported` holds, which requires a MUTATION BINDING,
while the card's own write gate falls back to the broader `isIdentityFieldInlineSaveSupported`. The
two gates disagree, and the narrower one wins at the point of offering — so `child.first_name` is
writable by the authority and can never be offered by the configured card. Employment editing will
meet the same seam: a write authority is not reachable until the row-building gate also admits it.

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

## Defects found and fixed in the browser, after the above was written

- **An operational Search result reached a URL and composed nothing.** The listener pushed the
  work-unit route from the workspace root; measured, the surface never mounted (polled to 60s) while
  an attention movement composed the same destination in ~2.0s. A soft navigation re-reads no
  address, so the page segment's seed is registered and never consumed. The scenario that was
  supposed to catch this asserted only the URL, and a blank page satisfies that — its own evidence
  screenshot shows an empty canvas under a passing test. It now asserts the composed surface.
- **A household could not be opened once its enrollment ended.** Both `resolveAttentionTarget` and
  Search's household branch resolved a family THROUGH its case and answered nothing when no active
  unit held one — an active queue as the existence authority for a family, which is the mistake the
  resolver's own header records having removed for every other grain.
- **Two non-exhaustive switches**, described above.
- **`searchSelectionAdapter` and `GlobalSearchBox` each knew only two durable grains** — the first
  would have dropped every household from pickers silently, the second would have sent a household to
  the resolver as a person id. The grain→table mapping is now one total function.
- **The fixture's published layout was insert-once, not idempotent.** It is not covered by the
  `fbc0%` deletes and carried `on conflict do nothing`, so editing the document in the file changed
  nothing in the tenant, silently.

## Where to resume

1. **Slice 9**, with the scope above understood as a slice rather than a wiring task.
2. **The native half of the equality proof**, once a tenant exists whose enrollment stages have
   reachable primary actions AND whose participation spine is intact. Both halves are needed; the
   second is currently missing tenant-wide.
3. Nothing else in slices 1–8 is outstanding.
