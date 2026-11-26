# §8 — Cross-branch fact matrix: subjects vs position

The Accounts list waits on both endpoints. This asks, for every remote read on each branch:
same query? same grain? same authority? can the acquisition be shared?

Read from the source at `e79f8967`. Nothing here is a measurement — it is what the two
branches *ask for*, which is the question a shared acquisition would have to answer.

| Table | Subjects asks | Position asks | Same grain? | Shareable? |
|---|---|---|---|---|
| `customers` | org-wide **paged scan**, `(id, name)`, cap 2000, ordered `(name, id)` | `.in("id", batch)`, `(id, name)`, only households the charges named | **Position's set ⊆ subjects' set.** Same columns. Same authority: presentation name only, never a key. | **Yes — wholly redundant.** The only genuinely duplicated fact across the pair. |
| `child_enrollment_agreements` | `.in("customer_id", …)` → `(customer_id, site_location_id)`; **plus** a second paged scan of `.is("customer_id", null)` → `(customer_member_id, site_location_id)` | `.in("id", …)` → `(id, customer_id, customer_member_id, site_location_id)` | **No.** Subjects wants *every* agreement of a household, to decide site visibility. Position wants *only the agreements its charges were billed from*, keyed by agreement id. | **No.** Position's columns are a superset but its rows are a strict subset: an unbilled agreement is invisible to position and decisive for subjects. |
| `customer_members` | three ways — by `id` (orphan agreements), by `customer_id` (child names), and supplied onward into the placement facets | not read | n/a | n/a |
| `customer_persons`, `child_placements`, `process_instances`, `location_program_categories`, `locations` | facet vocabulary only | not read | n/a | n/a |
| `charges`, collectible positions | not read | the money | n/a | n/a |

## What this settles

**The two branches cannot be collapsed into one acquisition.** Their agreement reads answer
different questions over different row sets, and position's charge scan has no counterpart at
all. A merged endpoint would still run both.

**Exactly one fact is duplicated: the household names.** It costs the position branch one
batched round trip after `collectible`, and subjects has already read a superset of it. That is
a real duplicate — and it is *not* evidence about the pole, because the two branches are fetched
concurrently by the client, so the list waits on `max(subjects, position)`, not their sum.

**Why this is recorded rather than acted on.** Two repairs this slice were made on exactly this
kind of reading — the facet unchaining (7 waves to 4) and the duplicate `customer_members`
removal. Both landed, both are gated, and **neither moved the deployed number.** The reading says
what *could* be shared; only the measurement says what is expensive. The instrument now names
every wave on both branches, including the four inside the placement facets. The next honest step
is a deployed sample, not a third repair.

## The shape the measurement is expected to resolve

Deployed staging, before this instrument: subjects ≈ 790–797 ms, of which `households` 103–172,
`agreement_sites` 229–249, `facets` 367–460, `assemble` ≈ 0. Position ≈ 653–961 ms, one label.

Two things make those numbers misleading on their own, and both are now addressed:

1. `agreement_sites` and the facet chain **run concurrently**, so each one's delta was measuring
   the other's wait. The marks carry completion offsets as well as deltas.
2. `facets` is mostly one helper — `readCurrentPlacements` — which is a four-wave dependent
   chain. Its two label reads (`location_program_categories`, `locations`) are independent of one
   another and awaited in sequence.

If the placement chain is the pole, the lever is §9/§10: those facets are **filter vocabulary**,
not list truth. A household is reachable, nameable and operable without knowing its room label.
