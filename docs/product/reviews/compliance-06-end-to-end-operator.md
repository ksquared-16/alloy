---
owner: product
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 06 — End-to-End Operator Experience

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** can a childcare director complete real operational work confidently, from entry through outcome, without understanding Alloy's implementation?

---

## 1. Timestamped environment and evidence boundary

| Item | Value |
|---|---|
| **Baseline captured** | **2026-07-16T22:19:36Z** |
| **Config re-verified** | **2026-07-16T22:21:06Z** |
| Branch | `c2a15d0e9` (review artifacts only) · app @ `origin/staging` `3cd8f8000` |
| Tenant | Firefly Early Learning · `localhost:3011` · authenticated (`qa-slot1-product@example.com`) |
| **Supabase target** | **REMOTE hosted project** |
| **Safe for mutation?** | **NO.** Shared, hosted, irreversible. |

**Consequence for this review:** the journey's forward path **cannot be executed**. Any step requiring a state change is classed **`UNTESTABLE IN SHARED TENANT`**. I did not execute a single mutation, and I do not present any inferred completion as executed.

**Baseline records** (22:19:36Z): `Wenc Family` (Blake 2y, Jarek 4y) · `Kurzman Family` (Lennon 2y, Wrigley 4m) · `Digan Family` (Robbie 3y, Zara 1y1m). All three: Stage **Lead**, status **Open**, badge **Overdue**.

**Baseline configuration** (22:21:06Z, stable evidence): Lead outcomes = `Reached / Qualified → Move to stage: qualification` · `Left Message → Stay in stage` · `Awaiting Response → Stay in stage` · `Unable To Reach → Stay in stage` · `Closed Lost → Close lead`. Outgoing Transitions: **none configured**. Actions OFF: `Send Form`, `Close Lead`, `Enroll Child`, `Waitlist Child`.

---

## 2. The operator journey map

| # | Step | State | Evidence |
|---|---|---|---|
| **0** | **Entry — `/workspace`** | ❌ **FAILS** | `VERIFIED` |
| 1 | New Leads (3 rows) | ✅ Usable | `VERIFIED` |
| 2 | Select a row → Focus Panel | ⚠️ Truth anchored; **no Frame** | `VERIFIED` |
| 3 | Current Work — *"Contact Family"*, **Blocked** | ⚠️ Partial | `VERIFIED` |
| 4 | Act — *"Message"* | ⚠️ Departs the card | `VERIFIED` |
| 5 | Record outcome — **"WHAT HAPPENED?"** | ✅ Usable | `VERIFIED` |
| **6** | **Lead → Tour** | ❌ **NO CONFIGURED PATH** | `HIGH CONFIDENCE` |
| 7–11 | Tour · Decision · Waitlist · Enrolling · Enrolled · Closed | **UNREACHABLE from Lead** | `HIGH CONFIDENCE` |

**The journey terminates at step 6.** Every Lead outcome either says *"Stay in stage"*, closes the lead, or moves the record to **`qualification`** — a stage absent from this process's six. `Tour` exists in the Builder and **nothing configured can reach it.**

---

## 3. The first point where the product fails the operator

**Step 0 — entry — before she selects anything.**

At **22:19:36Z**, in **one snapshot** (no cross-timestamp comparison), the workspace tells her:

| Where | Says |
|---|---|
| Enrollment pipeline card | **4 Family Leads** · **7 Children** |
| Today's Work | **New Leads 3** · **All Leads 3** |
| The actual queue | **3 families · 6 children** |
| KPI tiles | **3 Needs attention** · **4 Overdue work** · **7 Pipeline Children** |

**Her first screen gives two different answers to "how many families do I have?" (4 and 3) and two to "how many children?" (7 and 6) — inches apart, unlabelled, on the same card.**

And **2 of 3 KPI tiles** — *"Needs attention"* and *"Overdue work"* — both link to `/workspace/work-unit/needs-attention`, which renders **"Work unit not found."** (`VERIFIED`)

**The first thing she clicks is broken, and the first thing she reads is contradictory.** This is the journey's first product failure, and it precedes all operational work.

---

## Root violations

### Orientation · **Product**

**One violation:** the workspace mixes **analytics** and **operational counts** on one card with no provenance, and they disagree. *(Journey step 0. Surfaces: workspace, KPI tiles, process tile. Review 05 · R4, now at maximum severity.)*

`VERIFIED` — same snapshot: pipeline card **4/7** (metrics: `enrollment.active_families`, `active_leads`) vs queues **3/3** (projection) vs roster **3/6**.

**`HYPOTHESIS`:** the metrics are stale relative to the projection — the pre-cleanup figures were 4 leads / 7 children, and the metrics still read 4/7 while the queue reads 3/6. **Not asserted.** Either way the operator consequence is identical.

**Operator consequence:** she cannot establish the size of her own business on the screen built to orient her. **Every number she later sees inherits this doubt.**

### Attention and Scope · **Product** *(root: Reviews 01 · V1, 02 · F3)*

**One violation:** Current Work is scoped to the **Record of Truth** where the Constitution assigns it to the **Record of Attention**.

`VERIFIED` (step 3): *"Blocked"* with requirements **"Program"** and **"Date of Birth"**, **naming no child**, while the Children card lists each child's gaps individually.

**Operator consequence:** *"Program is missing"* is not actionable. *"Wrigley has no program"* is. The Constitution forbids the household-global assumption by name.

### Execution · **Product**

**One violation:** Current Work is positioned as where work is completed and functions as a launcher. `HIGH CONFIDENCE` — one action renders inline (schedule tour); the rest delegate or state *"not available inline from Current Work yet."*

### Readiness and Blockers · **UX**

`VERIFIED` (step 3): the **"Blocked"** chip renders while its cause sits behind **"2 remaining ▾"**. Grammar Law 9: *"A hidden tab/card must never hide the path to begin valid work."*

### Outcome and Movement · **Configuration** *(the journey-ending violation)*

**One violation:** the configured process has **no forward path from its first stage**.

`HIGH CONFIDENCE` (22:21:06Z, stable config evidence): the only non-terminal forward outcome targets **`qualification`**, absent from the six stages. `UNTESTABLE IN SHARED TENANT` — I did not click it, so the consequence (stranding) remains **unexecuted and unproven**.

**Operator consequence:** the most natural first action on her first lead — *"Reached / Qualified"* — is the one the product cannot honour. And **Configuration Health reports HEALTHY.**

### Continuity · **COMPLIANT — protect**

`VERIFIED` across every interaction in this review: the active Business Process, Work View, filters, sort, queue position, and selected subject all persist. Opening a record preserves the view in the route (`/work-unit/all-leads/{id}`). **Laws 7 and 8 hold. She never feels she changed products.** This is the strongest end-to-end behavior in the product.

### Cross-Surface Handoffs · **mixed**

Applying the brief's rule — *legitimate when it preserves mission, subject, and return path*:

| Departure | Verdict |
|---|---|
| Current Work → **workspace takeover** (*"Open workspace →"*) | ✅ **Legitimate** — subject preserved, *"← Back to summary"* present (`VERIFIED`) |
| Current Work → **Work Items** for cross-process work | ✅ **Legitimate by doctrine** — the canonical cross-process entry point (`HIGH CONFIDENCE`, untested) |
| Blockers → **"Children →"** | ❌ **Gap** — she leaves to fix what the card flagged; no stated return (`VERIFIED`) |
| *"Message"* → **header delegate** | ❌ **Gap** — the primary action leaves the card (`VERIFIED`) |
| Enrolling → Enrolled → **drawer-header modal** | ❌ **Gap** — banned from Current Work *and* hidden from the Builder (`HIGH CONFIDENCE`) |
| Decision split → **drawer Overview tab** | ❌ **Gap** — the only per-child path is off Current Work (`HIGH CONFIDENCE`) |

**Work Items boundary** (`HIGH CONFIDENCE`): doctrine is clear — Current Work is record-scoped; Work Items is *"the cross-process operational work entry point."* **The running product never states this boundary anywhere the operator can see it.** She has no way to know that completing a Work Item and completing Current Work are the same truth. Classification: **Product**.

### Counts and Feedback · **Product**

`VERIFIED` (22:19:36Z): counts match rows **within** the Work View strip (3/3/0/0/0/3) — the projection works. **Everything outside it disagrees**, and *"Overdue work"* = **4** against **3 rows all badged "Overdue."**

**`UNTESTABLE IN SHARED TENANT`:** whether counts refresh correctly after a change.

### Recovery · **Product**

The blocked/failure matrix, against the brief's checklist:

| Condition | Response | Evidence |
|---|---|---|
| Required information missing | Names the field, **not the child**; links away | `VERIFIED` |
| Action disabled in config | **Still offered** — no explanation | `VERIFIED` |
| Outcome target invalid | **No warning anywhere** — Health says HEALTHY | `VERIFIED` |
| Subject outside active Work View | **Silent** — `resolveFocusPanelScope` has zero callers | `VERIFIED` |
| View empty | **Honest** ✅ | `VERIFIED` |
| **Activity fails** | **Raw error: *"Could not load the opportunity drawer View Model. Retry"*** — 3/3 | `VERIFIED` |
| Config and runtime disagree | **Never surfaced** | `VERIFIED` |

**Two constitutional failures by the brief's own standard:** a **raw error** (Activity) and **unexplained silence** (out-of-scope, disabled actions). She receives no responsible subject, no recovery action, no confirmation of what changed.

### Operator Trust · **Product — the review's terminal finding**

**Confidence test — what she believes vs what is true:**

| Signal | She believes | Truth | Verdict |
|---|---|---|---|
| **Health: HEALTHY** | her process works | it has no forward path | **FALSE CONFIDENCE** |
| **"Actions configured — Ready"** | her actions work | 4 journey-critical actions are OFF | **FALSE CONFIDENCE** |
| **Active Pipeline: 0** | nobody needs working | predicate and description disagree | **AMBIGUITY** |
| **4 Family Leads / 3 rows** | ? | 3 | **AMBIGUITY** |
| **"Send form" offered** | she may send a form | it is disabled | **FALSE CONFIDENCE** |
| **"Reached / Qualified"** | the family advances to Tour | the target stage does not exist | **HIDDEN FAILURE** (`HIGH CONFIDENCE`, unexecuted) |
| **"WHAT HAPPENED?"** | she is reporting reality | she is | ✅ **CORRECT UNDERSTANDING** |
| **Queue position preserved** | she is where she left off | she is | ✅ **CORRECT UNDERSTANDING** |

**Five of eight signals produce false confidence, ambiguity, or hidden failure.** The two correct ones are the product's genuine achievements.

---

## Closing answers

### 4. Which journey steps are genuinely usable today

**Steps 1–5.** She can open the workspace, enter New Leads, select a family, read *"Contact Family — Reach the family, understand their needs"*, see her progress, open the workspace takeover, and reach the outcome picker asking **"WHAT HAPPENED?"** — all with her queue, filter, and place preserved. **That is a real product**, and it is where every strength in this review lives.

### 5. Legitimate canonical handoffs

The workspace takeover (subject + return preserved) · Work Items for cross-process work (canonical by doctrine, boundary never stated to the operator).

### 6. Product gaps

Blockers linking away · the primary action leaving the card · Enrolling → Enrolled requiring a surface banned from Current Work *and* hidden from the Builder · the Decision split existing only in the drawer Overview.

### 7. Can she complete Lead → Enrolled without Engineering or administrative correction?

## **No. She cannot leave Lead.**

`HIGH CONFIDENCE`, from configuration read at 22:21:06Z: the only forward outcome targets a stage that does not exist. `Tour` is visible in her Builder and unreachable by anything configured. **The journey ends at step 1 of 6** — and the product tells her it is **HEALTHY**.

`UNTESTABLE IN SHARED TENANT`: I did not execute the outcome, so the *stranding consequence* is inferred, not observed. **The absence of a path is configuration evidence and does not depend on execution.**

### 8. Is multi-child execution safe and understandable?

**No — and "safe" is the right word.**

- Both children, same stage: `VERIFIED` — indistinguishable. Requirements name fields, never children.
- Children in different stages: `HIGH CONFIDENCE` — unreachable; nothing gets past Lead.
- One child with work, one without: `HIGH CONFIDENCE` — the panel opens the family regardless (G-5); no active-child indicator exists.
- A child in another process: `UNTESTABLE` — no second process is configured.

**The Constitution's prohibition — *"household-global authority assumptions across multiple children/guardians"* — is violated at the only step reachable.** With `Enroll Child` and `Waitlist Child` both **OFF**, and actions applying to a family-grain subject, **whether an action would reach the intended child is `UNTESTABLE IN SHARED TENANT` — and that uncertainty is itself the finding.** A product that cannot demonstrate which child it is acting on is not safe for a customer, regardless of whether it is correct.

### 9. Can she trust what the product says happened?

**No — and the failure is asymmetric in the worst direction.** Every incorrect signal errs toward **confidence**: HEALTHY over a severed process; "Ready" over disabled actions; an offered action that is switched off; a count that disagrees with the rows beside it. **Nothing in the product ever tells her something is wrong.** The two signals she *can* trust — *"WHAT HAPPENED?"* and her preserved place — are exactly the two the product got right.

### 10. Minimum Product changes before a real customer can operate the journey

1. **A configured process must have a forward path — and the product must say so when it doesn't.** Without this, nothing else matters: she cannot reach step 2.
2. **Configuration must steer.** A disabled action must not be offered. *(Highest-value change across all six reviews.)*
3. **HEALTHY must mean the journey works** — or the word must change.
4. **One number per question, with declared provenance.** Her first screen must not answer "how many families?" twice.
5. **Name the child.** Current Work must scope to the Record of Attention.
6. **Fix the entry tiles.** The first click must not 404.
7. **No raw errors.** Activity must fail honestly or not at all.

Items 1–3 are prerequisites. **Item 1 is the only one that blocks a demo.**

### 11. Deferred to Review 07 — Gap Consolidation and Product Recommendations

1. Reviews 01–06 produce **~30 findings tracing to roughly 5 root violations.** Is that consolidation correct, and what is the true root count?
2. **Sequencing:** which single change unblocks the most others? (Candidates: *configuration must steer* · *a forward path must exist* · *Attention must be nameable*.)
3. **Is the live tenant's configuration representative, or uniquely broken?** Unresolved since Review 01 and it changes the verdict's scope — a fresh template-apply on a disposable tenant would settle it.
4. **What is genuinely done?** Continuity, stage consumption, "WHAT HAPPENED?", "Required when", the projection. The completion plan must protect these explicitly.
5. **What can only be certified on a disposable tenant?** The stranding consequence · multi-child action targeting · post-change count refresh · the full journey past Lead.
6. **Reconciling G-5 with non-enrollment Records of Truth** — flagged in Review 02, still open, and it decides whether Payments/Scheduling can use this panel.
