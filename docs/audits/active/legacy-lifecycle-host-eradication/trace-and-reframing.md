# Kelly → Household: the trace, and why the sprint's premise needs correcting

**Sprint:** `legacy-lifecycle-host-eradication` · slot 4 · base `8aeacaf30`. **Diagnosis only — no
product code changed.**

## Phase 2 — the exact branch that emits `lifecycle_wu_lead`

It is **not a fallback inventing a value**. The chain is:

```
Search Kelly (person subject, no process participation)
  → no operational_memberships          (memberships are computed per PROCESS CONTEXT;
                                          Kelly has no process_instances row)
  → resolveHostWorkUnitKey falls to `subject.household_case_work_unit_key`
  → fetchHouseholdCaseHosts  (hostWorkUnitResolver.ts:118)
        reads opportunities.work_unit_id for the household's newest case
        resolves it via fetchActiveWorkUnitKeys → work_units.key
  → that key IS "lifecycle_wu_lead"
```

So the value is the **case's persisted host unit**, read faithfully. Nothing fabricated it.

## Phase 1 — the inventory contradicts "legacy"

`lifecycle_wu_*` units are **actively produced, builder-owned infrastructure**, not historical residue:

| Evidence | What it shows |
|---|---|
| `lifecycleStageWorkUnit.ts:52` | `lifecycleStageWorkUnitKey(stageKey)` is a live key *generator* |
| metadata `lifecycle_builder_owned_v1: { builder_owned: true }` | the Lifecycle Builder owns these units |
| `builderOwnedLifecycleRuntime.ts:313` | creates one **per stage** on activation |
| `lifecycleStageWorkUnitQueueSync.ts:146`, `syncWorkUnitSortOrderFromBuilder.ts:41` | they are kept in sync, ongoing |
| `resolveWorkUnitByRouteSlug.ts:87`, `fetchWorkUnitsForSlugResolution.ts:83` | routing resolves them deliberately |

**A tenant whose lifecycle is builder-activated hosts its cases on these units.** They are the real
home of `opportunities.work_unit_id`.

> **Consequence:** filtering `lifecycle_wu_*` out of operator navigation with no replacement does not
> remove legacy cruft — it strands **every family case in a builder-activated tenant**, Kelly included.
> "Fail truthfully" would then mean Kelly gets *no* destination at all.

That is why the locked premise ("legacy infrastructure … must not be returned by Search destinations")
cannot be implemented as written without a data migration nobody has scoped.

## What is actually wrong — a narrower, resolvable defect

The observable complaint is right; the diagnosis differs. The operator was sent to a **unit key** where
they should have been sent to a **Work View**.

Route slugs resolve in the order `work_unit_key → work_view → queue_lane`. Both of these address the
same surface on staging:

```
/workspace/work-unit/lifecycle-wu-lead     ← the UNIT key   (internal identity, leaks the builder's naming)
/workspace/work-unit/new-leads             ← the WORK VIEW  (what an operator recognises)
```

The prior sprint's own staging evidence used the second form successfully. The unit behind it is
`587de5bc…`, whose **name is "New Leads"** — the same surface, addressed two ways.

So the true defect is:

> **A household/person subject resolves no family-grain Work View membership, so it falls back to the
> raw host unit key — which is builder-internal naming — and lands on that unit's default lens (`New`).**

This is exactly the gap Phase 3 of the brief describes, and it is fixable **without** touching the
lifecycle engine or migrating data:

1. resolve **family-grain Work View memberships for the household's case** (the machinery merged in
   PR #426 already does this for family subjects that *have* a process context — Kelly needs it via
   her household's case rather than her own participation)
2. emit the destination against the **Work View**, not the unit key
3. keep the identities distinct, as PR #429 established:
   - operational member = the **family/case row**
   - host = the **Kurzman case**
   - subject = **Kelly**
   - ASPECT = **Household → Kelly**

The merged attention listener already prefers `host_work_view_id` over `host_work_unit_key`, so once
a truthful view is carried, the lifecycle key stops appearing in operator URLs **as a consequence**
rather than as a ban.

## The guard the brief asks for, restated safely

A repo-level guard is still worth having, but it must be scoped to *operator-facing address
construction*, not to the identifier:

> No operator **navigation address** may be built from a Work Unit key when a truthful Work View slug
> exists for that surface.

Banning the identifier outright would fail against `resolveWorkUnitByRouteSlug`,
`fetchWorkUnitsForSlugResolution`, the queue sync, and the builder itself — all of which legitimately
speak it.

## Open decision for Kelly (cannot be resolved from repo evidence)

If a tenant's case sits on a stage unit that has **no** configured family-grain Work View, there is no
truthful operator address for it. Two options, and the repo does not decide between them:

- **A.** Offer no operational destination (fail truthfully, per the brief) — Kelly's `Household`
  becomes an entity context only, with no Work View pill.
- **B.** Treat the unit's default/canonical view as the address, accepting the builder-named unit as
  an internal detail behind a view slug.

Everything above is diagnosis. **No product code, tests, or navigation behaviour were changed.**

---

# Option A — Phase 1 answer: the runtime CANNOT host contextual focus without a Work View

Decision A was taken. Phase 1 asked whether neutral host + subject + ASPECT attention already exists.
**It does not.**

`composeWorkUnitProvisioningAnswer` (`workUnitProvisioningAnswer.ts:695`):

```ts
const activeView =
    findWorkViewById(workViews, req.requestedWorkViewId) ?? firstVisibleWorkView(workViews);
if (!activeView) {
    return fail("no_active_view", "no Work View is configured for this Business Process", workUnit);
}
```

Two consequences, both fatal to a neutral destination today:

1. **The fallback IS the defect.** A request naming no view silently adopts `firstVisibleWorkView` —
   which is how `New` comes to be marked selected for Kelly. There is no "no lens chosen" input; the
   absence of a lens is indistinguishable from choosing the first one.
2. **Absence is an error, not a scope state.** With no configured view the answer returns
   `no_active_view`, an `error` terminal — so nothing composes at all.

Everything after that line is derived from `activeView`: `lensSet`, `contextFrame`, `navFrame`, the
Operational Projection, the published rows, Settlement locators, and the Focus Panel. The kernel's
LENS scope is nullable (`attention.ts`), so K1 can *express* neutral attention — but the answer that
K2 prepares cannot currently *serve* it.

## The gap, and the smallest canonical shape for closing it

This is Runtime Kernel / Focus Panel ownership, not Search. The minimum is a **contextual (lens-free)
answer**: host record + subject + ASPECT, composing the record's Focus Panel with

- no active Work View, and no pill marked selected
- no Operational Projection and no published rows (there is no cohort to page)
- a URL projection that honestly represents contextual attention rather than borrowing a lens
- the existing membership guard untouched — a contextual answer selects a *host record*, not a
  cohort member, so `subject_unavailable` does not apply to it

It is genuinely new terminal semantics alongside `operational` / `empty` / `error`, which is why it
cannot be bolted on from the Search side: any Search-only workaround would have to pick a lens, and
picking a lens is the defect.

## Status

**HOLD.** The reframing and this Phase 1 answer are diagnosis; no product code was changed. Option A
is implementable, but it requires the runtime change above before Kelly's household destination can be
truthful — selecting `All` or `Tours` for "Open Kelly" would violate the decision just taken.
