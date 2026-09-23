---
owner: platform
status: canonical
last_reviewed: 2026-09-21
supersedes: []
---

# Coverage owns the day that differs

**Coverage is the day-specific planned Staff allocation. It answers where one person is
planned to be on one date, for one stretch of time, when that differs from — or
specializes — the durable Assignment.**

Coverage never rewrites the Assignment. A Tuesday spent in the Toddler room does not
change what this person's job is; it changes what Tuesday looks like. The two facts have
different lifetimes and different authors, and collapsing them is how a schedule loses
the ability to say "normally X, but that day Y".

## The grain

    employment × service date × half-open interval × place

`site_location_id` is required. `room_location_id` is optional, and **null is a real
answer**: it means Coverage at the site without a room — a float, a cover, someone
between rooms. It is never a placeholder for a room nobody chose, and the database
refuses the site's own id used as a room precisely so that "site-level" cannot be
counterfeited as a room-level fact and counted twice.

A room must resolve under the selected site through the canonical ancestor-aware
topology, not by a direct parent link, because rooms nest.

Intervals are **half-open**: `[start, end)`. 08:00–10:00 and 10:00–12:00 are adjacent,
not overlapping, and both stand. Coverage does not cross midnight in V1.

## One place at a time, and a history of the places

One employment cannot hold two **effective** allocations that overlap in time. That is
the invariant Coverage exists to state, and it is enforced by the database, not by the
code that happens to write it.

History is the tension. A revision genuinely overlaps what it replaces — that is what
makes it a revision — so an exclusion constraint over all rows would make lineage
impossible, and an exclusion constraint over none of them would make the invariant a
suggestion.

The resolution is that the constraint applies **only to active rows**, and every
supersession retires the predecessor *before* writing the replacement, inside one
transaction. The order is load-bearing. Reversed, the constraint refuses a valid
revision; skipped, an operator gets two people-shaped facts for one person.

## Five operations, and why they are five

| Operation | What it means | What it leaves |
|---|---|---|
| `CREATED` | this is the plan | one active row |
| `REVISED` | the plan changed | replacement active, predecessor `superseded` |
| `CORRECTED` | the plan was recorded wrong | replacement active, mistake `superseded` |
| `CANCELLED` | the plan is withdrawn, nothing replaces it | row `cancelled`, interval free again |
| `SUPERSEDED` | *(the other half of a revision or correction)* | the retired row, still readable |

Revision and correction share one mechanism and differ only in the transition recorded.
That difference is not bookkeeping: **"we moved her" and "we typed the wrong room" are
different claims about what was true on that day**, and a month later only the recorded
transition can tell them apart.

Nothing is deleted and nothing is edited in place. Cancelling frees the interval to be
planned again while the cancelled row stays readable.

Cancelling is the one operation that writes to an existing row rather than adding one,
and it touches only the cancellation fields. **Why an allocation existed and why it was
cancelled are separate columns** — `reason_key` and `cancel_reason_key` — because they are
facts about different moments. An early version wrote both into `reason_key`, so
cancelling a correction erased the record that it had been a correction; the hosted audit
projection caught it.

## Reading it

Two directions, one definition of effective.

- **employment-first** — `staff_coverage_effective_for_employment`: what is this person
  planned to do over this window?
- **place-first** — `staff_coverage_effective_for_site`, wrapped by
  `readCoverageByPlace`: who is planned *here*? This is the operational question, and
  the batch read is shaped for a day-and-place surface.

Both resolve effectiveness through the same `lifecycle_state = 'active'` predicate in
SQL. The TypeScript read model groups and orders; it does not re-read lineage or decide
what "current" means. **Two query directions interpreting supersession independently is
how a schedule starts disagreeing with itself**, so a parity test asserts the two return
an identical set of allocation ids for equivalent scope, and it is meant to fail the day
someone adds a filter to one side.

## Writing it

Four registered commands, through the canonical action runtime:

    staff_coverage.plan      staff_coverage.change
    staff_coverage.correct   staff_coverage.cancel

Each makes exactly one database call. Coverage mutations are pairs — retire one, write
the other — and `supabase-js` has no multi-statement transaction, so the pair lives
inside a database function. A half-committed pair would show an operator success over a
day with no plan at all, or with two.

Authorization is enforced in `execute`, not offered as a hint: org scope from the
server-resolved context, site scope from the actor's access scope. Reads **narrow** to
the sites the actor holds; writes are **refused** by name. The lifecycle commands check
the site the allocation is at, and — when it is being moved — the site it is going to,
because a permitted origin must not license an unpermitted destination.

## Audit is the lineage, not a second table

There is no Coverage event log. The rows carry who, when, which predecessor, which
transition and why, and a parallel log would be a second place to ask what happened,
free to drift from the first. `projectCoverageAudit` reads a lineage and names the five
operations above.

One consequence worth knowing: a superseded row has no "retired at" column, because its
retirement and its replacement are the same transaction. `SUPERSEDED` therefore reports
the successor's timestamp and actor. That is exact rather than approximate — but it
means the projection resolves a whole lineage rather than filtering rows by date first.

## What this is not

Coverage is **not** Availability (when someone *can* work), **not** Presence (what
actually happened), and **not** Readiness (whether they are cleared to).

Coverage does **not yet count toward staffing sufficiency.** Slice 3 establishes the
authority only. Baseline Staff supply arithmetic is unchanged and still whole-day, and a
room-level Coverage row beside a site-level assignment must not read as two people. The
time-aware projection that reconciles demand, baseline supply, availability, Coverage
and presence over derived time segments is a later slice, and it is the slice that gets
to decide what Coverage means for a ratio.

Coverage is also not Calendar, not Time Off, and not payroll.

## Related

- [Assignment owns its recurring time](assignment-time-authority.md) — the durable fact
  Coverage specializes, and the staffing-participation flag that governs baseline supply
