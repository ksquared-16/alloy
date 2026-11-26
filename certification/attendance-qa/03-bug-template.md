# Attendance QA — bug report template

One bug per finding. Copy the block, fill it in, and hand it back unchanged —
this format is written to be fed straight into a Vacilando repair slice, so the
fields are the ones an engineer needs to reproduce without asking you anything.

**The two fields people skip, and why they matter most:** *Starting state* (most
attendance bugs only reproduce from a particular day/child state) and *Actual*
(what you saw, not what you concluded).

---

```
BUG ID:        ATT-BUG-0NN
SCENARIO:      ATT-QA-NN — <title from the guide>
SEVERITY:      P0 | P1 | P2 | P3

ENVIRONMENT
  Staging SHA: 
  Site:        
  User / role: 
  Browser:     
  Device:      (desktop / tablet / kiosk)
  Timestamp:   (with timezone)

STARTING STATE
  - child(ren):        
  - committed room:    
  - expected today:    yes / no
  - already present:   yes / no
  - known-away state:  
  - device state:      
  - anything else that had to be true:

STEPS TO REPRODUCE
  1. 
  2. 
  3. 

EXPECTED   (quote the guide's "Expected result")

ACTUAL     (what happened — describe what you saw, not what you think caused it)

SURFACES CHECKED   (which agreed, which disagreed)
  - Attendance workspace:
  - Focus Panel:
  - Analytics:
  - Financials:
  - Kiosk:

EVIDENCE
  - screenshot / video:
  - any on-screen error text, copied exactly:

REPRODUCIBLE   always / sometimes / once only
```

---

## Severity

| | Meaning | Examples from this guide |
|---|---|---|
| **P0** | Safety, security, truth, money, or data loss | kiosk explains *why* a collection was refused (ATT-QA-23); a family's names left on the kiosk for the next person (ATT-QA-27); an unauthorized adult collects a child; an amount in Attendance disagreeing with Financials; attendance facts lost |
| **P1** | A V1 operator workflow is materially broken | a closure produces mass not-arrived (ATT-QA-17); Workspace and Focus Panel disagree about where a child is; check-in does not register |
| **P2** | Bounded usability or product defect | a count refreshes only after reload; confusing label; an awkward but survivable flow |
| **P3** | Polish / follow-up | wording, spacing, ordering, a missing empty-state sentence |

**When in doubt, rate it higher and say why in Notes.** An over-rated bug costs a
conversation; an under-rated one costs a release.

**Do not file** a bug for anything the guide marks `DEFERRED BY DESIGN`. If you
believe a deferral is wrong, that is a product decision — raise it as a note on
the pass, not as a defect.
