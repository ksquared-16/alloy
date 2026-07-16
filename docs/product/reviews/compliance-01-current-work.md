---
owner: product
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 01 — Current Work

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** does the running Current Work surface faithfully express the Product Constitution?

**Standard:** the Constitution — Record of Truth · Record of Attention · Context Frame · Focus Panel Product Model · Lifecycle of Record of Attention · Product Principles · the frozen Business Process ownership chain.

**Evidence:** all findings `VERIFIED` in the running product (authenticated, Firefly tenant, localhost:3011) unless marked otherwise. No new concepts.

---

## Verdict

**Current Work expresses the Constitution's *vocabulary* faithfully and its *structure* only partially.** The failures cluster in one place: **Current Work renders the Record of Truth where the Constitution says it belongs to the Record of Attention.**

---

## What it expresses CORRECTLY

These are real and should be protected.

| Constitutional principle | How Current Work honors it |
|---|---|
| **P1 — Operators report reality** | The completion flow asks **"WHAT HAPPENED?"** — narration, not state manipulation. `VERIFIED` |
| **Business meaning before fields** | Leads with *"Contact Family — Reach the family, understand their needs, and determine the next step."* Grammar Law 9 forbids *"raw fields before business meaning"*; Current Work obeys. `VERIFIED` |
| **Context Frame decides what leads** | Current Work is the first card in the panel — the Frame expressed by **placement**. `VERIFIED` |
| **Record of Truth is anchored** | The shell header holds *"kurzman Family · Open · North Campus"* and never moves while working. `VERIFIED` |
| **P2 — Outcomes produce durable state** | Each outcome carries its consequence. `VERIFIED` |
| **P16 — Honest gaps** | *"No current work configured"* states absence rather than fabricating. `HIGH CONFIDENCE` |

---

## What it VIOLATES

### V1 — Current Work flattens three children into two unscoped requirements · **Product**

`VERIFIED`. The card reads **"Blocked"** with requirements **"Program → Children →"** and **"Date of Birth → Children →"**. **No child is named.** Meanwhile the CHILDREN card on the same screen reads *"3 children need program & schedule"* — Lennon, Lennon, Wrigley, each *"Needs program, schedule & start date."*

Two undifferentiated field names stand for **three children × three gaps**.

The Constitution forbids this **by name**:
> *"The drawer does **not** flatten this into one household blob… The drawer makes the **active child and relationship scope explicit**."*
> **Forbidden:** *"Household-global authority assumptions across multiple children/guardians."*

**Why it matters:** the director cannot act. "Program is missing" is not workable; "Wrigley has no program" is. The card states a household-global gap the Constitution says may never be assumed.

**This is the constitutional statement of the defect this review has circled since Deliverable #1.** It is not a grain bug. Current Work is rendering the **Record of Truth** (the household) where the Constitution says it belongs to the **Record of Attention** (the child with the gap).

### V2 — The Summary Mode does not exist · **Runtime Expression**

`VERIFIED`. Mode controls present in the live panel: **`["Work", "Activity"]`**. The Constitution's Mode set is **Summary / Work / Activity**:

| Mode | Constitution |
|---|---|
| **Summary** | *"Ambient understanding of the whole record… business meaning first; reading, not editing"* |
| **Work** | *"Active operational work surfaces… cards for the domains in play"* |
| **Activity** | *"History / timeline"* |

**Summary is absent, and its content has been absorbed into Work.** HOUSEHOLD and CHILDREN — ambient understanding, reading not editing — render inside the **Work** tab beside Current Work. Two Modes collapsed into one.

**Why it matters:** the Constitution's economy is that *the Frame decides which Mode leads*. With only two Modes, the Frame has nearly nothing to decide. The mechanism that lets one panel serve Tour, Billing, Attendance and Waitlist is inert.

### V3 — The Context Frame is never named · **Product**

`VERIFIED`: the panel never renders the word "Mission", and no Frame is surfaced. The glossary defines **Mission** as *"Operator-facing name for the **Context Frame** — why the operator is here."*

The Frame is expressed **only** by placement (what leads). It is never **stated**.

**Why it matters:** the mission requires Current Work to answer *"Why am I working on it?"* The Constitution has the concept and an operator-facing name for it. The surface uses neither. The director can see *what* to do and never *why she is here*.

### V4 — Blockers link away · **Product**

`VERIFIED`. Both blockers resolve to **"Children →"** — out of Current Work.

Violates **P8** (*"Operators open a record to **complete work**"*; Focus = *"Help me do it"*). Current Work states the problem and hands her elsewhere to solve it.

### V5 — "Blocked" is shown while its cause is collapsed · **UX**

`VERIFIED`. The **"Blocked"** chip renders while requirements sit behind **"2 remaining ▾"**.

Violates Grammar Law 9: *"A hidden tab/card must never hide the path to begin valid work"* — and **P9**, whose stated intent is to *"guide operators without hard-locking the process."* The card hard-locks (a Blocked chip) and hides the guidance.

### V6 — Two CTAs compete for primacy · **UX**

`VERIFIED`. **"Message"** under NEXT ACTION; **"Record outcome"** rendered green and dominant under RECORD OUTCOME.

Under **P1**, these are not peers: *Message* is the act, *Record outcome* is the report of the act. The Constitution orders them; the screen does not. The visually dominant control is the one she should reach for **second**.

### V7 — Activity is not Attention-scoped · **Runtime Expression**

`VERIFIED`. "Recent activity" renders *"3 children — Lifecycle"*, *"Open — Status"*, *"Updated"*.

The Constitution: Activity is *"History / timeline of what has happened — **append-only record of facts**."* *"3 children"* is not a thing that happened; it is a field value. The Mode is showing state where the Constitution specifies facts.

### V8 — "Move to Qualification" · **Configuration** (+ **Product**)

`VERIFIED`. The live Lead stage offers an outcome targeting `qualification` — absent from the process's six stages.

The frozen ownership chain names this exact anti-pattern: **"Stages with no work ('Qualification')" → "Fold the work into the stage that owns it."** The configuration violates a documented prohibition; **the product permits it** and Configuration Health calls it **HEALTHY**.

### V9 — A disabled action is still offered · **Configuration** / **Runtime Expression**

`VERIFIED`. `Send Form` is `OFF / Disabled` in Process Actions; Current Work offers **"Send form"** under MORE ACTIONS.

Violates **P6** (*configuration steers behavior; runtime owns execution*) and **P12** (*consumers request resolved values; they never compute*).

### V10 — Duplicate requirement lists · **UX**

`VERIFIED`. The workspace takeover renders the same two items under **WAITING ON** and again under **REQUIREMENTS**.

### V11 — "Choose the configured result for this work" · **UX** / **Documentation**

`VERIFIED`. Two leaks in seven words: *"configured"* (the operator does not care how it got there) and *"result"* (the product renamed Results → Outcomes; the code still carries `@deprecated Prefer availableOutcomesConfigSource — Results renamed to Outcomes`).

---

## Classification summary

| # | Finding | Class |
|---|---|---|
| V1 | Three children flattened into two unscoped requirements | **Product** |
| V2 | Summary Mode absent; collapsed into Work | **Runtime Expression** |
| V3 | Context Frame / Mission never named | **Product** |
| V4 | Blockers link out of Current Work | **Product** |
| V5 | "Blocked" shown, cause collapsed | **UX** |
| V6 | Two competing CTAs | **UX** |
| V7 | Activity shows state, not facts | **Runtime Expression** |
| V8 | Outcome targets a non-existent stage | **Configuration** |
| V9 | Disabled action still offered | **Configuration** / **Runtime Expression** |
| V10 | Duplicate requirement lists | **UX** |
| V11 | "configured result" leakage | **UX** / **Documentation** |

**Not one finding is classified *Implementation*.** Every divergence is a product-level expression failure, not a coding defect.

---

## The single sentence

**Current Work is built for the Record of Truth and named for the Record of Attention.**

V1, V3, V4 and V7 are one violation seen from four angles: the card renders the household when the Constitution says it belongs to the child with the gap; it never names why she is here; it sends her away to fix what it flagged; and it reports the record's state where it should report the work's facts.

**The Constitution does not need to change. Current Work is expressing the wrong coordinate.**
