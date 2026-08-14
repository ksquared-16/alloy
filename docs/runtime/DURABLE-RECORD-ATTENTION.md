---
owner: platform
status: IN PROGRESS — Workstreams A, B, D landed; C, E, F open
last_reviewed: 2026-08-14
sprint: records-roster-completion-phase0 (slot 1)
base: origin/staging @ a38c1a260
---

# Durable Record Attention — subject-first resolution

**The position.** An active Work Unit says where a subject is **worked**. It does not say whether the
subject **exists**. Durable record attention therefore resolves

```
subject (durable)  +  operational host/context (optional)
```

never `find operational host, or the subject does not exist`.

This document tracks the convergence that makes that true end to end. It is **not yet canonical
doctrine** — the statement holds at the resolver today and not yet at the surface, and promoting it
before the surface lands would assert something an operator cannot do. `docs/platform/operator/` gains
the doctrine paragraph when Workstream D certifies.

Origin of the slice: `docs/product/records-roster-completion/phase-1-record-attention-host-gap.md`.

---

## Landed — Workstream A: the attention contract (commit `96cf90e66`)

`lib/workUnits/operatorFocusTarget.ts` now answers with an `AttentionResolution`:

```ts
type AttentionResolution = {
    subject: { type: "opportunity" | "person" | "child"; id; person_id; household_id };
    operational_host: { host_entity_type: "opportunities"; host_entity_id; host_work_unit_key } | null;
};
```

Decisions worth keeping:

- **`host_entity_type` stays `"opportunities"`.** A *host* genuinely is always a case. What changed is
  that a host is no longer required for a subject to exist. Widening the host type would have modelled
  Person as a kind of Work Unit host, which it is not.
- **Intent is declared, never inferred.** `intent: "operational"` (default) answers "where do I work
  this?" and still returns null when nothing does. `intent: "durable_record"` answers "open this."
  The same record has different right answers under the two, and because `null` is *legitimate* on the
  operational side, inferring the intent would fail silently — the exact failure mode this whole slice
  exists to remove.
- **`hasOperationalDestination()` is the two-field rule, in one place.** A case whose unit went
  inactive yields a host with a null key: the case exists (so naming it is not a lie) but nothing
  active pages it (so it is not a destination). Every consumer needs both facts; a rule re-derived per
  call site is one edit from disagreeing.
- **The child grain exists now** (`customer_members` / `child`). It previously had no arm at all and
  had to be asked for as its `person_id`, which silently reframed the question as "this person" and
  lost the member identity the enrollment subject is keyed by.
- **`resolveOperatorFocusTarget` is unchanged in behaviour** and the resolve route still returns
  `target` identically under both intents, so no existing caller moved.

Also fixed here, found by negative control NC4: `opportunityIsVisible` short-circuited to `true` for
unrestricted operators without ever reading the org, so a cross-tenant opportunity id resolved as a
target. It was safe only downstream, by accident — the work-unit lookup is org-scoped and the client
requires a key. A durable subject has no such second gate.

Certification: `tests/operator/durableRecordAttention.test.ts` (22 tests) including NC1–NC5.

---

## The finding that shaped Workstreams B–D — and what it produced

**A durable subject cannot ride `ProvisioningAnswer`.** Its `operational` terminal *requires*
`workUnit`, `businessProcess`, `activeWorkView`, `lensSet` and `contextFrame`
(`workUnitProvisioningAnswer.ts`) — all queue concepts a durable record genuinely does not have.
Making them nullable would weaken a heavily-certified contract for work that is not queue work.

The other producer was the right one, and it was already prepared:
`FocusPanelWorkModeModel.subject.type` is a plain `string` (explicitly *not* the `"opportunity"`
literal) and `phase` is **declared** rather than inferred from `source`, with the stated reason that
otherwise "a Child producer would have had to call itself `drawer_vm` to get settled semantics."

---

## Landed — Workstream D: grain is a card CONCERN (commit `59cc710ee`)

`focusPanelCardGrainConcern.ts` is the third concern folded into the card registry, after
IDENTITY.title and LIFECYCLE, following the registry's own design law — a small separately-typed
contract, its own composer, existing cards untouched.

```ts
type CardGrainApplicability = { grains: readonly OperationalSubjectType[] };   // default: ["opportunity"]
```

- **A card declares; a composer selects.** The rejected alternative was a central
  `if (grain === "person") return [...]`, which is precisely the failure
  `SECOND-SURFACE-CERTIFICATION-DESIGN.md` §5 names: "any central switch edited … means a contract is
  still missing — fix the contract, do not special-case."
- **The default is case-only, so silence never widens applicability.** A new card is case-only until
  it says otherwise; it reaches a person surface only because someone declared that it can.
- **An unregistered key applies to NOTHING** — including the case grain. A card the registry has
  never heard of must not reach the enrollment panel through a permissive default.
- **`employment` is the first card declared for two grains**, and the reason the concern exists:
  employment is a fact about a PERSON, which a case merely projects.
- **Default composition is per-grain.** `opportunity` returns the SAME OBJECT reference, so the
  enrollment panel is identical rather than equivalent. `child` is declared EMPTY until Workstream C
  rather than borrowing the enrollment cards — the exact defect R3 recorded.

## Landed — Workstream B: the durable Person producer (commit `59cc710ee`)

```
persons row → composeDurablePersonSubject → focusPanelWorkModeModelFromDurablePerson → one grid
```

- Reuses `buildPersonDrawerEntityPayloadForViewModel`, which already calls
  `buildPersonEmploymentComposition`. Employment meaning arrives **decided** by `lib/employment`;
  nothing is recomputed, and `buildCaseEmploymentProjection` (the *case's* projection of the same
  person-owned truth) is deliberately not on this path.
- Supplies no `ProvisioningAnswer`, invents no `workUnit`/`activeWorkView`/`contextFrame`, fabricates
  no Opportunity. Declares `phase: "settled"`.
- `businessProcess` is all-null — the honest answer. Borrowing the household's enrollment stage would
  put a family's process state on a staff member's panel.
- **Person V1 is one card, and sparse is correct.** Carrying `current_work` / `household` /
  `children` across would render empty shells asserting relationships that do not exist, and an empty
  card is a claim.

### Two defects caught while wiring

1. **The grid would have applied a tenant's PUBLISHED case doc to a person subject.**
   `entity_layouts` addresses the Summary row by `entity_type="opportunities"`, so a tenant who had
   opened the Surface Builder would silently get enrollment cards on a staff member, while a tenant
   who had not would get the correct sparse panel. Two tenants, two behaviours, no error. Publication
   is now case-only.
2. **The person Employment card hardcoded archetype/icon** where the case path derives them from
   `system5ArchetypeForCard` / `system5IconForCard` — two answers for one card, guaranteed to drift
   at the first System 5 change. Both now read the same platform helpers.

## Blocker status

| # | Blocker | State |
|---|---|---|
| **R2′** | `subject.type: "opportunity"` / `grain: "case"` hardcodes | **CLOSED for the durable path.** The durable producer parameterizes both. The *drawer-VM* producer still hardcodes `"opportunity"` — correct, since its only input is an `OpportunityDrawerViewModel` whose `entity.type` is that literal. It becomes a real hardcode only if a non-opportunity VM is ever fed to it. |
| **R4** | card keys all `@grain case`, no selection-by-grain | **CLOSED.** Declared per card, selected by composer. |
| **R3** | one enrollment default composition serves every surface | **CLOSED.** Per-grain defaults; case unchanged by object identity. |
| **R9** | `entity_layouts` CHECK allows only `drawer\|queue`; Summary row keyed `entity_type="opportunities"` | **OPEN, and deliberately not worked around.** A tenant cannot PUBLISH a person-grain composition. A code-owned default needs no such key — which is how fallback composition already works — so certification does not depend on it. Widening the addressing is a schema migration and its own slice. |

## Remaining plan

| WS | Work | State |
|---|---|---|
| **A** | attention contract: subject + optional host, declared intent | **DONE** — `616864314` |
| **B** | durable Person payload + producer | **DONE** — `59cc710ee` |
| **D** | grain concern + per-grain default composition | **DONE** — `59cc710ee` |
| **C** | durable Child subject over `customer_members`, reusing `composeChildDrawerViewModel` | open — unblocked |
| **E** | carry `operational_host` onto the durable panel as enrichment when present | open |
| **F** | client half: `intent` on `useOperatorRecordFocus`, durable destination, call-site compatibility | open |

**Client half is still deliberately not written.** Threading `intent` through
`useOperatorRecordFocus` before a durable destination exists would ship a seam whose durable branch
has nowhere to go — a half-wired gesture that resolves and then does nothing is precisely the class of
silent failure this slice was opened to remove.

**Browser certification is not yet possible** and is not claimed: the durable model composes
server-side, but no route mounts it, so there is nothing to open in a browser until Workstream F.

**PASS/FAIL is inherited from `SECOND-SURFACE-CERTIFICATION-DESIGN.md` §5:** any central switch edited,
the Kernel or Surface Host learning about `person`, or a new `if (grain === "person")` in a platform
layer means a contract is still missing — fix the contract, do not special-case. Nothing in A/B/D
edited the Kernel or the Surface Host.
