---
owner: platform
status: IN PROGRESS — Workstream A landed, B–F open
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

## The finding that shapes Workstreams B–D

**A durable subject cannot ride `ProvisioningAnswer`.** Its `operational` terminal *requires*
`workUnit`, `businessProcess`, `activeWorkView`, `lensSet` and `contextFrame`
(`workUnitProvisioningAnswer.ts`) — all queue concepts a durable record genuinely does not have.
Making them nullable would weaken a heavily-certified contract for a case that is not queue work at
all.

The other producer is the right one. `focusPanelWorkModeModelFromDrawerVm` already builds a
`FocusPanelWorkModeModel` from a composed subject payload with **no queue involved**, and the model
contract is already grain-agnostic by design:

- `subject: OperationalSubjectRef` — `type` is a plain `string`, explicitly *not* the `"opportunity"`
  literal;
- `phase` is **declared** by the producer, not inferred from `source`, with the stated reason that
  otherwise "a Child producer would have had to call itself `drawer_vm` to get settled semantics."

So the platform was already prepared for a second producer. Three things still block one:

| # | Blocker | Where |
|---|---|---|
| **R2′** | `focusPanelWorkModeModelFromDrawerVm` hardcodes `subject.type: "opportunity"`; `buildOperationalContext` hardcodes `grain: "case"` | both modules |
| **R4** | card keys are all `@grain case`; there is no selection-by-grain, so a person producer has no card set to emit | `focusPanelCardRegistry` / `focusPanelCardModel` |
| **R3** | one default composition doc (the enrollment singleton) serves every surface — a person surface would render enrollment cards | `composition/focusPanelSummaryDefaultComposition.ts` |

R3/R4 are already named and measured in `SECOND-SURFACE-INVENTORY.md`; this slice is their first
production consumer. `R9` (`entity_layouts` CHECK allows only `drawer|queue`, and the row is addressed
by `entity_type="opportunities"`) bites only when a tenant wants to *publish* a person composition —
the default-doc path does not need it, so it is deferred, not solved.

`deriveOpportunityFocusPanelCards` (1005 lines, case-grain) is **not** the path. A person producer
selects the cards applicable to its grain and builds their models; it does not reuse the case
derivation. That is a new domain producer, not a second card system — one grid, one renderer, one
`FocusPanelWorkModeModel`.

---

## Remaining plan

| WS | Work | State |
|---|---|---|
| **A** | attention contract: subject + optional host, declared intent | **DONE** — `96cf90e66` |
| **B** | person subject payload + `focusPanelWorkModeModelFromDurableSubject`; parameterize the two remaining hardcodes (R2′) | open |
| **C** | child durable subject over `customer_members`, reusing `composeChildDrawerViewModel` | open |
| **D** | grain-selectable card set (R4) + per-grain default composition (R3); prove the SAME grid renders it | open |
| **E** | carry `operational_host` onto the durable panel as enrichment when present | open |
| **F** | client half: `intent` on `useOperatorRecordFocus`, durable destination, call-site compatibility | open |

**Client half is deliberately not written yet.** Threading `intent` through
`useOperatorRecordFocus` before a durable destination exists would ship a seam whose durable branch has
nowhere to go — a half-wired gesture that resolves and then does nothing is precisely the class of
silent failure this slice was opened to remove.

**PASS/FAIL is inherited from `SECOND-SURFACE-CERTIFICATION-DESIGN.md` §5:** any central switch edited,
the Kernel or Surface Host learning about `person`, or a new `if (grain === "person")` in a platform
layer means a contract is still missing — fix the contract, do not special-case.
