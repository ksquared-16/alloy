# The Alloy Product Acceptance Pack

Recommended from what actually worked while writing the Attendance V1 pack.
Reusable for Financials, Enrollment, Work Items, Communications, Processing,
Staffing, Scheduling and whatever comes next.

## The three gates, and why they are separate

| Gate | Owner | Evidence | Means |
|---|---|---|---|
| `V1_CERTIFIED` | Vacilando | typecheck, guards, targeted + regression suites, promoted-tree certification | the code does what its tests say |
| `DIRECTOR_QA_ACCEPTED` | Director | a completed results checklist, every non-deferred row PASS | a human exercised the product and believed it |
| `DEMO_READY` | Director | the runbook executed end to end without improvisation | it can be shown to someone who did not build it |

**Never infer one from another.** Automated certification cannot produce
`DIRECTOR_QA_ACCEPTED`; a passing suite is a statement about assertions, not
about whether a product owner can use the thing. Equally, a successful demo is
not QA — a runbook deliberately avoids the edges QA exists to probe.

Programs report all three, e.g. `V1_CERTIFIED · DIRECTOR_QA_PENDING`.

## The five files

```
certification/<domain>-qa/
  01-director-qa-guide.md        scenarios, in operator language
  02-qa-results-checklist.md     one row per scenario, copied per pass
  03-bug-template.md             a findings format an engineer can act on
  04-demo-runbook.md             the short, safe, coherent story
  05-product-acceptance-pack.md  this standard (write once, link thereafter)
```

## What made the Attendance pack work

**Ground every navigation path in the shipped build.** The paths in the guide were
read out of the promoted code, not remembered. A guide with one invented click
path teaches the Director to distrust all of it, and they cannot tell which line
was wrong.

**Mark deferrals in the guide, not just in the engineering notes.** A Director who
hunts for a missing feature for ten minutes and then files a bug has lost the
time twice. `DEFERRED BY DESIGN` with the reason turns a false finding into
understanding — and the checklist lists them again, so a *present* deferred
feature becomes a finding in its own right.

**Say what maturity you are actually shipping.** `FOUNDATION` on teacher capture
and family intent prevents the worst QA outcome: a Director concluding the
product is broken because they expected a teacher app that was never built.

**Write bug severity with examples from the guide's own scenarios.** "P0 —
safety/security/truth/money" is abstract. "P0 — the kiosk explains *why* it
refused a collection" is a thing a human can recognise in the moment.

**Make the checklist copyable per pass.** Repairs need a second pass, and
comparing passes is how you learn whether a fix held.

**Give the demo recovery instructions per step.** The tenant is never quite where
you left it. A step that says what to do when reality differs is the difference
between a confident demo and a live debugging session.

**Write the demo as one story with two moments.** For Attendance those were *the
count that did not change when a child moved* and *the child who turned up on her
holiday*. Every domain has two such moments; find them and build the runbook
around them rather than touring the menu.

## Per-domain adaptation

Keep: the section shape, the three gates, severity definitions, the deferral
discipline, the checklist columns.

Replace: scenario IDs (`FIN-QA-nn`, `ENR-QA-nn`), the vocabulary table, the
navigation list, and the two demo moments.

Ask for each new domain:
1. What are the three numbers an operator reads first?
2. Which two surfaces must agree, and what does disagreement look like?
3. What does this domain **cause** elsewhere, and where is that consequence
   verified? (Attendance → Financials was the highest-value cross-check.)
4. What is deliberately absent in V1, and what would a Director mistake for a bug?
5. What is the destructive or sensitive action QA must exercise and the demo must
   avoid?

## Standing rules

- No QA scenario may require a database mutation. If setup cannot be reached
  through product controls, that is a product gap worth recording.
- No demo step may touch a terminal, a provider that can be down, or a credential.
- A scenario whose expected result cannot be stated in one sentence is two
  scenarios.
- `BLOCKED` is not `PASS`. A scenario that could not be reached is unproven, and
  the reason belongs in Notes.

---

## Attendance Productization V1 — current gate status

| Gate | Status | Evidence |
|---|---|---|
| `V1_CERTIFIED` | **YES** | Threads 1–9 COMPLETE_PROMOTED; promoted-tree certification recorded in `certification/attendance-convergence/` and `certification/attendance-oip/` |
| `DIRECTOR_QA_ACCEPTED` | **`DIRECTOR_QA_PENDING`** | the guide in this folder has not yet been executed by a human |
| `DEMO_READY` | **PENDING** | the runbook has not yet been executed end to end |

**Program status: `V1_CERTIFIED · DIRECTOR_QA_PENDING`.**

Director QA failures become repair work; affected scenarios are rerun on a fresh
copy of the checklist. Attendance V1 is not closed on automated evidence alone.
