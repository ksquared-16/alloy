---
owner: platform
status: decided
last_reviewed: 2026-09-11
supersedes: []
---

# D2 — does tenant bootstrap belong in the access change audit?

**Decision: `SYSTEM_BOOTSTRAP_AUDIT = DEFERRED`.** It does not block D2, and D2 does not depend on it.

---

## The question

D2 records every consequential change to who may do what: six producers, each writing a
`mutation_events` row inside the transaction that changes access. Creating an organization also
determines who may do what — `seed_default_rbac` fires on insert into `public.orgs` and seeds the
full default package for every system role. So: is that history?

## The answer, and why

It is a fact about the platform, not an act by an operator, and the audit exists to answer *"who
changed this, and what did it used to be?"*

**There is no operator to name.** Every other event in this audit has one, and the producers refuse a
change that cannot name theirs — deliberately, because `origin` already distinguishes a system change
from a human one and inferring "system" from a missing actor would make an unattributed operator
change indistinguishable from an automated one. Bootstrap has no actor by construction: nobody chose
the default package for this tenant, the platform did, the same way it does for every tenant.

**There is no "used to be".** A bootstrap grant has no previous state — the organization did not
exist a moment earlier. `previous_state` would be empty on every row, which is the shape of a fact,
not of a change.

**And it would be loud.** One tenant creation seeds the active catalog across seven system roles. At
one event per grant that is dozens of rows per organization, every one of them saying the same thing:
*the platform created this tenant the way it creates every tenant.* An operator opening the Security
audit log on a new organization would page through that before reaching the first thing a person did.
An audit whose signal is buried in its own boilerplate has been made worse, not more complete.

## What was NOT done, on purpose

- **No grouped bootstrap event.** A single `access.org.bootstrapped` row is defensible and is exactly
  the design worth doing properly rather than sneaking into a certification run. It needs a decision
  about what its `new_state` means — the whole seeded matrix? a package version? — and that decision
  belongs with the Director / Regional default role package work, which is the next slice.
- **No backfill.** No historical migration invents events for organizations that were bootstrapped
  before D2 existed. Fabricated history is worse than absent history: absent history is visibly
  absent, and fabricated history is indistinguishable from the real thing.
- **No fake pending event** to satisfy an inventory scan.

## What this costs today

A new organization's Security audit log is empty until someone changes something. That is truthful —
nobody has yet — and the empty state says so in the product's own words rather than claiming the
feature is planned.

The one real gap: if a default package is ever changed by a migration, that change is invisible to the
audit. It is visible in the migration history, which is where a platform-wide change belongs, and
`seed_default_rbac`'s own assertions already fail loudly when the package and the catalog disagree.

## When to revisit

With the Director / Regional default role package slice, which has to decide what a package IS before
an event can say one was applied.
