# Ten journeys the fixture cannot clean up

## What the delta says

Post-repair, against the committed baseline (`371fa31ef`, 2026-09-02T16:49Z):

| | baseline | post-repair | fixture-owned? |
|---|---|---|---|
| opportunities | 5 | 4 | yes — leak fixed and swept |
| participations | 4 | 4 | — |
| context-free participations | 2 | 1 | yes |
| participation-anchored journeys | 2 | **14** | **no — see below** |
| sessions bound to an enrollment journey | 23 | 33 | no — follows the journeys |
| ledger, migration postconditions, exceptions, duplicate-active guard | — | unchanged | — |

Attribution of the 14:

```
fixture namespace,        since baseline     2   <- the two certification families. Correct.
outside fixture namespace, before baseline   2   <- the baseline's own two. Correct.
outside fixture namespace, since baseline   10   <- contamination.
```

## What the ten are

Enrollment journeys minted against children **outside** the reserved certification namespace, after
the baseline snapshot was taken. They are residue from earlier certification attempts in this
program, made before the fixture existed, when certification was driven against whichever tenant
children were to hand. The ten sessions are theirs.

They are mine. The fixture did not create them and cannot remove them: its reset is scoped to the
reserved e-mail domain, and these children are real tenant records that merely had a journey started
on them. That scoping is the right design and should not be widened — a fixture that can delete
outside its own namespace is a worse problem than the one it would solve.

## Why they are not being deleted here

Removing them means deleting rows belonging to real households on a selector no better than "an
Enrollment journey created after 16:49 today". That predicate has no namespace behind it, it would
reach anything an operator happened to start during the same window, and it is exactly the kind of
DELETE this certification has twice now insisted be measured before it is used. The Opportunity
sweep earned its selector with a census; this one cannot.

So it is reported rather than acted on. It needs a Director decision, not an agent's judgement.

## What it does and does not affect

It does not affect the QA gate. The two certification families are clean, both realize the
participant objective, and the behaviour under test is theirs. A reader of the tenant's Enrollment
counts, however, will see ten journeys that no certification artifact explains — so this file
explains them.

## Options

1. **Leave them.** They are inert, on real children, in a certification tenant. Cheapest, and the
   count stays wrong.
2. **Remove them by id.** Enumerate the ten, confirm each child was never genuinely enrolling, and
   delete that explicit list. Auditable, no predicate, needs one governed read and one governed write.
3. **Leave them and re-baseline.** Take a new baseline now and measure future deltas from it. Honest,
   but it bakes the contamination into the reference.

Option 2 is the recommendation: an explicit list of ten ids is the only selector here that cannot
over-reach.


---

## Re-measured after promotion (Phase 2 gate)

Post-promotion census, taken after PR 652 merged, the toolkit was reinstalled from the merge commit,
and the fixture was reset once / built once / verified twice from the installed build:

| | baseline | post-promotion | fixture-owned? |
|---|---|---|---|
| opportunities | 5 | **4** | yes — below baseline; the leak sweep removed more than the fixture creates |
| participations | 4 | 4 | yes — unchanged |
| context-free participations | 2 | 1 | yes |
| participation-anchored journeys | 2 | **16** | **no** |
| sessions bound to an enrollment journey | 23 | 35 | no — follows the journeys |
| ledger, migration postconditions, exceptions, duplicate-active guard | — | unchanged | — |

The fixture's own footprint is measured in the same census: **2 people, 2 households, 2 children**.
Exactly the two certification families, and no more. So of the 16 participation-anchored journeys the
fixture accounts for 2, the baseline accounted for 2, and **12 were created outside the reserved
namespace since the baseline** — up from the 10 recorded above.

**This fails the Phase 2 gate as written.** "No unexplained residue" is not satisfied, and the residue
is growing rather than static, which the earlier write-up did not anticipate. The growth matters more
than the count: something is minting participation-anchored journeys against non-namespace children,
and until it is named it will keep going.

The Opportunity half of the delta, by contrast, is now clean and provably fixture-owned — that leak
was found, fixed forward, and swept backward on a selector measured before it was used.

The recommendation is unchanged and now more urgent: enumerate the specific journeys and delete that
explicit list. An explicit list of ids remains the only selector here that cannot over-reach, and it
needs a Director decision rather than an agent's judgement.
