---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 03 — Business Process Builder

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** can an administrator configure a Business Process that faithfully expresses the Constitution, without understanding Alloy's runtime?

**Evidence:** `VERIFIED` = observed in the running Builder (authenticated, Firefly tenant). No new concepts.

---

## Verdict

**The Builder's controls are better than this review expected, and better than its output.**

The authoring vocabulary is largely constitutional. The failure is not that administrators are given bad controls — it is that **nothing verifies what they produce**, and **two responsibilities are authored twice**. An administrator can author. She cannot validate.

---

## Findings by constitutional responsibility

### Stage Membership — **compliant**

> *Stage Membership answers: where is this process subject positioned?*

**`VERIFIED`, and correct.** The live panel states the Constitution exactly:

> *"Which leads belong here? … Records land here when an outcome moves them to this stage. **Membership is the persisted stage — not a status filter**."*

This is post-S4 doctrine, rendered where an administrator reads it. **Protect this sentence.**

One residue (`VERIFIED`, **UX**): it renders **"Leads with stage = `lead` belong to this stage"** — a raw key in prose — and displays *"Lead status: Open"* directly beneath a claim that membership is *not* a status filter. **Consequence:** an administrator reasonably reads the status pill as a rule. The concept is right; the sentence undercuts itself.

---

### Work — **compliant controls, no verification**

> *Work answers: what must the operator do here?*

**`VERIFIED`, and good:** *"Work items (1) · + Add · Contact Family — **Select a work item to configure purpose, timing, and outcomes**."* That is the constitutional shape of work, in plain language.

**Violation — the administrator cannot see what the operator will experience.** (`HIGH CONFIDENCE`, **Product**)

- *"Preview runtime opens the workspace with this Work View active — filters and assigned layouts apply **when saved**."* — preview is **post-save only**.
- *"Preview work unit"* exists **only inside the dead `LifecycleStageWorkspace`** — never rendered.

**Constitutional principle:** *Configuration should feel easier than execution* (Law 4). **Consequence:** the administrator authors Current Work blind, and discovers her configuration by becoming her own operator. Every finding in Review 01 was reachable only this way.

**Wayfinding defect** (`VERIFIED`, **UX**): the Recommended Actions block reads *"Configure primary, helpful, and alternate-path actions per work template in the **Operating Plan editor above**."* It is a pointer, not a control, and "above" names no section on screen.

---

### Outcomes and Movement — **ONE root violation**

> *Constitution: operators report what happened · outcomes produce durable state · movement is earned through outcomes · **stage movement must not be configured through competing mechanisms**.*

**Root violation: the Builder exposes two movement mechanisms, and shows the authoritative one empty.** (`VERIFIED`, **Product**)

On the live Lead stage, simultaneously:

- **Outgoing Transitions → *"No outgoing transitions configured."***
- **Possible Outcomes → "Reached / Qualified" → *"Move to stage: `qualification`"***

Records move via the **outcome's** target while the section named for movement sits empty. **An administrator reading the Transitions section would correctly conclude records do not leave this stage. They do.** There is no reading of that screen that yields the truth.

**These four symptoms are one violation, not four:**

| Symptom | `VERIFIED` |
|---|---|
| Transitions section empty while records move | yes |
| Raw destination key rendered — `Move to stage: qualification` | yes |
| Dangling target — `qualification` is not among the six stages | yes |
| *"Stay in stage"* rendered **twice** on one outcome ("Awaiting Response") | yes |

They share one root: **movement is authored in two places, and neither is declared authoritative.** The raw slug and the dangling target are only visible *because* the outcome carries the movement the Transitions section should own.

**Protect:** the outcome definition itself — *"What can happen when operators act from this stage. **Each outcome produces a durable state change** — a status transition, a stage movement, or follow-up work."* That is the Constitution, stated correctly, by the Builder.

**The Qualification validation example — the Builder fails both tests:**

- **Does it prevent or expose stale references to deleted stages?** **No.** It *renders* the stale reference as an unexplained lowercase slug, and Configuration Health calls the process **HEALTHY**.
- **Does it help an administrator understand a Stage must own meaningful work?** **No.** No check, copy, or affordance addresses it — even though the frozen ownership chain names *"Stages with no work ('Qualification')"* as an anti-pattern by name.

---

### Requirements and Readiness — **the Builder is compliant; the runtime is not**

> *Requirements answer: what must be true for this work or transition?*

**This is the review's most important correction, and it reverses an earlier classification of my own.**

**`VERIFIED` — the Builder authors readiness properly, on all three axes the Constitution needs:**

| Axis | Control | Assessment |
|---|---|---|
| **Timing** | **"Required when"** → `Creating the record` · `During this stage` · `Leaving this stage` · `Completing the process` | **Excellent.** Plain language. No `stage_progress`/`stage_exit` keys leak |
| **Scope** | Entity tabs — `Person` · `Child` · `Lead` · `Family` | Correct |
| **Enforcement** | `Off` · `Rec` · `Req` | Three levels, matching *"guide… without hard-locking"* |

The Builder expresses **P9** faithfully: *"Entry and exit expectations guide operators without hard-locking the process."* **Protect all three controls.**

**The violation is downstream** (`VERIFIED`, **Runtime Expression**):

The Builder's scope is **by entity type** — *"Program required for Child."* The operator's need is **by entity instance** — *"Wrigley has no program."* The Builder has no way to express an instance, and should not: instances do not exist at configuration time.

**So Review 01 · V1 was misclassified by me as `Product`. It is `Runtime Expression`.** The Builder correctly authors a type-scoped requirement; the runtime fails to resolve it to the instance the Record of Attention names. **Three children each fail "Program required for Child," and Current Work renders "Program → Children →" naming none.** That is not an authoring defect. The configuration is right.

**Residue** (`VERIFIED`, **Documentation**): *"Stage requiredness is stored separately from Layout placement — **see configuration-ownership-doctrine**."* A doctrine filename shipped as help text.

---

### Actions — **the core constitutional test fails**

> *The test: when configuration says an action is disabled, can the administrator trust the operator experience will reflect it?*

## **No.** (`VERIFIED`, **Runtime Expression**)

`Send Form` is **`OFF · Disabled · All stages`** in Process Actions. Current Work offers the operator **"Send form"** under MORE ACTIONS.

**Constitutional principle:** **P6** — *configuration steers behavior; runtime owns execution*. **P12** (frozen, D3) — *consumers request resolved values… they never compute*.

**Consequence — the most serious in this review.** If a switch does not steer, **no configuration in the Builder can be trusted**, and every other control on this page is decorative. The administrator's model of her own system is false, and nothing tells her.

**Compounding** (`VERIFIED`): the live tenant has **`Send Form`, `Close Lead`, `Enroll Child`, `Waitlist Child` all OFF** — the three actions the enrollment journey terminates through — while Configuration Health reports **"Actions configured — Ready."**

**Authoring ceiling** (`VERIFIED`, **Product**): *"Process Actions — 10 configured"* with **no create affordance**. Ten fixed capabilities. **Consequence:** a new domain cannot be configured; it must be engineered. Automation is a disabled **"Create automation (pending)"**.

---

### Subject and Grain — **one truth, two controls**

> *Do not assume process subject, Stage grain, row grain, Record of Attention, and action subject are identical.*

**They are not, and the Builder mostly gets this right.**

| Concept | Where authored | Verdict |
|---|---|---|
| **Stage grain** | `ROW TYPE (GRAIN)` — Stage Context | Authored once, at the Stage — **correct** per the frozen chain (*"Stage owns operational work (grain…)"*) |
| **Row grain** | — | **Derived.** Every Work View reads *"Inherited from included stages"* — **correct** |
| **Record of Attention** | — | Not authored — correct (runtime resolves it) |
| **Journey** | `Journey` — Operational Experience | ❌ **Duplicate** |

**Violation** (`VERIFIED`, **Product**): **`Journey` (Family journey / Child journey) authors the same truth as `ROW TYPE (GRAIN)`, in a different section.** Two controls, one truth, free to disagree. The frozen chain assigns grain to Stage — **`Journey` is the outlier, not the pair.**

**Consequence:** an administrator can create a stage whose grain and journey disagree, with no warning. `HIGH CONFIDENCE` — this is the structural origin of the child-track execution failure (the queue reads grain; execution reads journey).

**Additional** (`VERIFIED`, **UX**): three of five row types render **"COMING SOON"** as disabled buttons; `Family` reads *"One queue row per **opportunity** (family case)"* — CRM vocabulary in a childcare product.

---

### Work View Relationship — **the Builder teaches this correctly**

Stage → Work View is **compliant**, and notably so:

- *"Work Views define how operators consume process work"* — Work View as perspective ✅
- *"Row type · **Inherited from included stages**"* — Work Views **consume** Stage membership; they do not redefine it ✅
- Predicates read *"Show work when… **Stage equals Lead**"* — refinement within membership, not re-derivation ✅

**This is the frozen chain working:** *"Work View consumes processes (lens)."*

**Flagged for Review 04** (`VERIFIED`, not adjudicated here):

1. **"Registration" selects `Stage equals Enrolling`.** An operator-friendly name is permitted — but does it *obscure the underlying journey*? The tab and the stage share no word.
2. **Inheritance is claimed where nothing was inherited.** *Active Pipeline* and *Tours* have **no stage condition** yet display *"Family · Inherited from included stages."* *All Leads*, also unscoped, correctly shows nothing. A derivation reporting a provenance it lacks.
3. **`All Leads` has no row type at all** — the catch-all's grain is unresolvable at author time.

---

### Configuration Safety — **the readiness verdict cannot be trusted**

> *The question is not whether checks exist. It is whether an administrator can trust the product's readiness verdict.*

## **She cannot.** (`VERIFIED`, **Product**)

Configuration Health reports **HEALTHY — "Ready for staff on the workspace"** for a process that, on the same tenant, simultaneously:

- routes its first stage's primary outcome to **a stage that does not exist**
- has **no configured forward path from Lead to Tour** (`HIGH CONFIDENCE` — every other Lead outcome says "Stay in stage")
- has **four journey-critical actions switched OFF**
- offers the operator an action configured **OFF**

**Root violation: Health verifies plumbing, not steering.** Its five checks — tile visible, queues published, filters match, records query, actions matrix — all ask *"is it wired?"* **None asks *"will this do what the administrator intended?"*** Against the Constitution's standard (*configuration steers behavior*), Health does not check the one thing that matters.

**Its own evidence is stale** (`VERIFIED`):

- *"7 work units on **/dept**"* — `/dept` returns **404** and renders the **public marketing site**, including a **"Sign In"** link. A signed-in administrator clicking *"View →"* is shown a page implying she is logged out.
- The 7 named work units (Follow Up, Decision, Enrolling, Enrolled…) **do not match the six the operator sees**.
- *"**Lifecycle** appears on the workspace"* — the retired internal name, in a success message.
- *"Actions matrix: 2 work-unit rail; 1 queue row; 6 drawer; 1 other"* — a developer's debug string.
- *"…assignment home elsewhere.)"* — impenetrable, with a doubled period.

**Consequence — this is worse than having no check.** A green verdict converts an administrator's healthy uncertainty into false confidence. **Misleading reassurance is the most damaging failure on this surface**, because it is the only surface whose entire job is to tell her whether she got it right.

---

### Administrator Comprehension

**Would a first-time childcare director understand this without documentation?** Partly — and more than expected.

**Comprehensible** (`VERIFIED`): *"Design how work moves through your organization."* · *"Which leads belong here?"* · *"Required when → Leaving this stage"* · *"Show work when…"* · *"Select a work item to configure purpose, timing, and outcomes."* · the Process Participation panel — *"The platform manages this for you… nothing to configure."*

**Not comprehensible** (`VERIFIED`, **UX** / **Documentation**): **`ROW TYPE (GRAIN)`** · *"one queue row per **opportunity**"* · *"Leads with **stage = lead**"* · **`Move to stage: qualification`** · *"see **configuration-ownership-doctrine**"* · *"**Lifecycle** appears on the workspace"* · *"Actions matrix: 2 work-unit rail…"*

**Universality violated inside the Builder** (`HIGH CONFIDENCE`, **Product**): the generic `StageEditorV2` imports **`enrollmentStageMembership`** and renders Stage Membership only when that enrollment-specific lookup matches (`if (!membership) return null`). **For Summer Camp or Hiring, the Stage Membership section silently disappears** — violating the frozen governing principle **P15**: *"no childcare-specific platform abstractions."* **Consequence:** the surface meant to prove universality is the one hardcoded to one domain.

---

## Closing answers

### 1. What the Builder expresses correctly — protect these

1. **"Required when"** — `Creating the record` / `During this stage` / `Leaving this stage` / `Completing the process`. **The best control in the product.** Readiness timing in the director's language, zero leakage.
2. **Requirements scope + enforcement** — entity tabs and `Off / Rec / Req`. Together with timing, a genuinely well-formed readiness model.
3. **"Each outcome produces a durable state change"** — the Constitution, stated by the Builder.
4. **"Membership is the persisted stage — not a status filter"** — post-S4 doctrine where administrators read it.
5. **"Row type · Inherited from included stages"** — grain authored once, derived correctly. The frozen chain, working.
6. **The Process Participation panel** — *"The platform manages this for you."*
7. **Authoring restraint** — auto-generated keys, no JSON textarea, humanized filter operators, the `GrainImpactCallout`.

### 2. Constitutional responsibilities currently unclear or contradictory

| Responsibility | State |
|---|---|
| **Movement** | **Contradictory** — two mechanisms; the authoritative one renders empty |
| **Subject / grain** | **Contradictory** — `Journey` duplicates `ROW TYPE (GRAIN)` |
| **Actions** | **Broken** — configuration does not steer the operator experience |
| **Configuration safety** | **Broken** — the verdict is false, and its evidence is stale |
| **Work** | **Unverifiable** — no pre-publish preview |
| Stage membership · Requirements · Work View relationship | **Compliant** |

### 3. Could a competent administrator configure a valid Business Process without Engineering?

**No — but the diagnosis is narrower than Review 01 implied.**

She can **author**. The controls are largely constitutional and mostly speak her language. She cannot **validate**: nothing shows her the operator experience before publishing, nothing catches a target stage that does not exist, nothing warns that her `Journey` and `Row type` disagree, and the one screen that claims to answer *"is this ready?"* answers **HEALTHY** when it is not.

**The natural experiment stands.** The live configuration was authored by someone with more context than any customer will have, and it cannot move a family from Lead to Tour. **Nothing told them.**

### 4. Can Configuration Health be trusted?

**No.** It verifies wiring, not intent; it reports HEALTHY over a severed process; and its evidence cites a route that 404s to the marketing site. **Against the Constitution, an unverified green verdict is a violation of *configuration steers behavior* — it asserts steering it never checked.**

### 5. Minimum Product changes for constitutional compliance

Stated as product requirements. No implementation.

1. **Declare one authoritative movement mechanism.** The Builder must not present two, and must never show the authoritative one empty while records move.
2. **Make configuration steer.** An action switched OFF must not reach the operator. Until this holds, no other control on this surface can be trusted.
3. **Make Health verify intent, not wiring** — target stages exist; a forward path exists; enabled actions match what operators see. And it must stop citing dead routes.
4. **Resolve `Journey`.** One truth, one control. The frozen chain says grain belongs to Stage.
5. **Show the operator experience before publishing.**
6. **Remove the domain hardcode from the generic stage editor** (P15).

**Note:** items 1–3 are prerequisites for trusting anything else here. **Item 2 is the single highest-value change in this review** — it is the difference between a configuration product and a configuration-shaped one.

### 6. Deferred to Review 04 — Work Views

1. Does *"Registration"* selecting `Stage equals Enrolling` obscure the underlying journey, or is operator-friendly naming working as intended?
2. *Active Pipeline* / *Tours* claim *"Inherited from included stages"* while scoping to **no stage**. What is inheritance reporting?
3. `All Leads` resolves to **no row type**. How should a catch-all's grain be understood at author time?
4. The Work-View label set, the lane set, and the Health set are **three different vocabularies** for one journey. Which, if any, is the operator's?
