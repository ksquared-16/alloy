---
owner: product
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 04 — Work Views

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** do Work Views faithfully operate as the operator-facing perspectives over Business Process work, without redefining Business Process, Stage Membership, Truth, Attention, or Frame?

> **Evidence-base note.** The tenant's demo data changed during this review: leads **4 → 3**, Pipeline Children **7 → 6**. The duplicate `kurzman Family` lead and duplicate `Lennon` child — both reported in Deliverable 01 — are gone, and the surviving Kurzman correctly shows two children. This is consistent with a deliberate cleanup of the reported defects and inconsistent with an accidental transition (a transition cannot dedupe a child on a different record). Counts below are **current**; earlier deliverables cite the pre-cleanup figures.

---

## Verdict

**Work Views are the most constitutionally compliant surface reviewed so far.** They consume Stage Membership correctly, they do not create an alternate stage system, and they are genuinely the operator's navigation. The violations are **honesty defects in derivation and counting**, not model defects.

---

## The six Work Views as configured (`VERIFIED`)

| View | Stage predicate | Other predicate | Row grain | Sort | Count | Frame implied |
|---|---|---|---|---|---|---|
| **New Leads** | `Stage equals Lead` | — | Family *(inherited)* | Updated · Newest | **3** | Lead / New Lead |
| **Active Pipeline** | **none** | `Updated date is Prev:15:Days` | Family *(claims inherited)* | Updated · Oldest | **0** | ❓ none |
| **Registration** | `Stage equals Enrolling` | — | **Child** *(inherited)* | Updated · Newest | 0 | Enrolling |
| **Waitlist** | `Stage equals Waitlist` | — | **Child** *(inherited)* | Updated · Newest | 0 | Waitlist |
| **Tours** | **none** | `Tour date equals Next:7:Days` | Family *(claims inherited)* | Tour date · Oldest | 0 | Tour |
| **All Leads** | **none** (catch-all) | — | **none resolved** | — | **3** | ❓ neutral |

Surface assignment: New Leads → *"Focus Panel: Enrollment Focus Panel Summary · V10"*; all others → *"Surface default"*.

---

## Findings by constitutional responsibility

### Operator Perspective — **compliant**

Each view answers *"what operational work matters to me right now?"* in the director's language: *"Brand new leads entering the funnel."* · *"Leads that have actively been worked in the last 15 days."* · *"Children that want to start but no available space."* · *"Tours in the next 7 days."* (`VERIFIED`)

**Protect this.** These descriptions are the clearest operator writing in the product.

### Stage Consumption — **compliant, and this is the headline strength**

`VERIFIED` on all six views:

- Stage predicates reference **configured Stage Membership** — `Stage equals Lead`, `Stage equals Waitlist`.
- Row grain reads **"Inherited from included stages"** — never authored on the view.
- Views **refine within** stages; none re-creates membership from statuses.
- A view **may** include no stage predicate and remain valid (Active Pipeline, Tours, All Leads).

**The frozen chain is working: *"Work View consumes processes (lens)."* Work Views have not become a second stage system.** This is the one place in this review where the running product does exactly what the Constitution says.

### Naming and Vocabulary — **one violation**

**`VERIFIED`:** *"Registration"* selects `Stage equals Enrolling`. The tab an operator reads and the stage it selects **share no word**, and **nothing on any surface connects them.**

**Constitutional principle:** *Work Views may filter, sort, group, **label**, and frame work* — labelling is explicitly permitted. But: *they must not become an alternate Stage system.*

**Product consequence:** a director works "Registration" for a month and never learns her process has a stage called "Enrolling." When she opens the Builder, she cannot find the thing she has been doing. **The label has not framed the journey — it has replaced it**, because the journey is never shown beside it.

**Classification: UX.** The naming freedom is correct; the missing companion is the defect. *(See closing §2 for the Product rule.)*

### Row Grain — **the model is sufficient; two views lie about it**

**`VERIFIED` — the rule holds in every authored case:**

| Case | Behavior | Verdict |
|---|---|---|
| One stage | Inherits that stage's grain | ✅ |
| N stages, same grain | Inherits | ✅ |
| N stages, different grains | Blocked at save — *"Mixed row types — resolve before saving"* | ✅ |
| **No stage predicate** | **Nothing to inherit from** | ✅ *when reported honestly* |
| Catch-all | Same | ✅ *when reported honestly* |

**Violation** (`VERIFIED`, **Runtime Expression**): **Active Pipeline** and **Tours** scope to **no stage** yet display **"Family · Inherited from included stages."** They inherit from nothing and report a provenance they do not have.

**All Leads is not the defect — it is the model working.** It has no stage predicate, so it has no authored grain, and it **shows none**. The runtime copy states this correctly: *"No stage condition — row type is determined by the records that match at runtime."*

**Grounded in existing principles:** **P16** — *honest gaps, never invention*. **P10** — *the unit of work must be explicit*. All Leads honors both by declining to assert. Active Pipeline and Tours violate both by asserting a derivation that did not occur. **A derivation that reports a provenance it lacks is worse than one that reports none.**

### Record of Attention — **downstream dependency, not a Work View defect**

- **Family-grain views** (New Leads, Active Pipeline, Tours): row and Attention **coincide**. The operator clicks the Kurzman family and gets the Kurzman family. ✅ `VERIFIED`
- **Child-grain views** (Registration, Waitlist): the row is a **child**; the panel opens the **family**. The operator cannot know which child is active. `HIGH CONFIDENCE` — both queues hold zero records, so this is read from config + Rule G-5.

**Classification: downstream compliance dependency (Review 02 · F3).** The Work View correctly declares child grain. **The panel cannot express it.** Work Views must not be changed to compensate — that would push Attention into the lens and violate the chain.

### Context Frame — **not established by any view**

**`VERIFIED`:** no Work View surfaces a Frame; the panel never renders "Mission" (Review 02 · F2).

Each view *implies* a Frame — Tours → Tour, Waitlist → Waitlist — exactly as the Canonical Interaction Model's own table predicts (*"Waitlist → Child enrollment context → Frame: Waitlist"*). **The implication is never realized.**

Two views imply **no** Frame at all (`VERIFIED`):

- **Active Pipeline** — "worked in the last 15 days" is a *recency filter*, not an intent. Why is she here?
- **All Leads** — a catch-all. Per the Lifecycle, this is the **neutral-Frame** case: the Frame must resolve from the **selected work**, not from the view.

**Product rule, from the existing Constitution:** a view with a specific Frame leads with it; a **catch-all carries a neutral Frame and lets the selected work supply it**. Neither is invalid. But a view whose Frame is neither specific **nor** honestly neutral — Active Pipeline — is **not suitable as an execution entry point**; it is a triage list.

**Classification: Product** (inherits Review 02 · F2).

### Projection and Counts — **the numbers do not tell one story**

The Constitution: *counts, rows, membership, and Focus Panel scope must derive from **one** Operational Projection*, and `count === rows.length` **by construction**.

**Where it holds** (`VERIFIED`): pill counts match rendered rows across all six views. New Leads **3** / All Leads **3** / others **0**, with honest empty states. **The projection is doing its job.**

**Violation 1 — a view whose count contradicts its own description** (`VERIFIED`, **Configuration**):

> **Active Pipeline** · *"Leads that have actively been worked in the last 15 days."* · predicate `Updated date is Prev:15:Days` · **count 0**

All three leads were updated three days ago. Either the predicate means *within* 15 days (then **0 is wrong**) or it means *not touched in* 15 days (then **the description is wrong**). `HIGH CONFIDENCE` on the contradiction; I did not determine which side is at fault. **Consequence:** the operator cannot tell whether the view is empty because there is no work, or because it is misconfigured. **Zero is the most dangerous number a Work View can show** — it is indistinguishable from "done."

**Violation 2 — the KPI tiles still do not reconcile** (`VERIFIED`, **Product**, inherited):

> Header: **3 Needs attention · 4 Overdue work · 6 Pipeline Children**. Queue: **3 leads, all showing "Overdue."**

- *Needs attention* **3** — reconciles (coincidentally).
- *Pipeline Children* **6** — reconciles at **child grain** (2+2+2). Doctrine permits this: *"Metrics vs queue counts may differ by grain… This is intentional."*
- **Overdue work 4 — reconciles with nothing.** Three leads, all overdue, and the tile says four. It counts `operational_tasks`; the queue counts opportunity rows.

**One number on the operator's primary surface has never reconciled with anything she can see, through two different datasets.** Not a rounding issue — a different question wearing a borrowed name.

### Navigation — **compliant, and genuinely good**

**`VERIFIED`:**

- Every view is its **own route** — `/workspace/work-unit/{viewSlug}` — path routing, no query strings.
- **Deep links preserve the view**: `/workspace/work-unit/all-leads/{recordId}`. Opening a record **does not lose the Work View**.
- Selected state, order (1–5), and visibility all come from configuration.
- An empty view resolves to **no subject** rather than a false one — *"null only after an authoritative empty result."*

**The operator knows where she is, and moving between views does not feel like changing products.** This is Law 7 and Law 8 working. **Protect it.**

### Configuration Safety — **cannot predict the operator experience**

An administrator authoring a Work View can see which stages she includes and how rows sort. She **cannot** see (`VERIFIED`): what one row will represent when no stage is scoped · what will open · what Frame the operator gets · how counts will behave · whether her description matches her predicate.

*"Preview runtime… filters and assigned layouts apply **when saved**"* — post-save only. **Active Pipeline is the proof**: a view whose label and count disagree shipped, and nothing at author time could have caught it.

**Classification: Product** (inherits Review 03).

### Universality — **the concept survives; two assumptions do not**

**The concept holds.** A Work View is *a named operator lens over actionable operational work* in every domain tested: Failed Payments, Vacation Requests, Scheduling Conflicts, Missing Check-ins, Hiring, Maintenance. Nothing in the model is enrollment-shaped — predicates, sort, grouping, and surface refs are all domain-neutral. **The Canonical Interaction Model's own table already names four of these as valid entries.**

**Two enrollment assumptions block it** (`HIGH CONFIDENCE`):

1. **Grain is `family | child`.** `WorkViewGrainBucket = "family" | "child"`; three of five row types read **"COMING SOON."** Hiring needs a *candidate*; Maintenance needs an *asset*. Neither is a family or a child.
2. **Rule G-5 pins the panel to case grain** (`opportunity_id`). Failed Payments' Record of Truth is *"the family's billing account"*; a Maintenance ticket is not an opportunity at all.

**Neither is a Work View defect.** The lens is universal; **its grain vocabulary and its landing surface are not.** Classification: **Product** — and G-5's own rationale already anticipates this, so it is flagged, not reopened.

---

## Closing answers

### 1. What Work Views express correctly — protect these

1. **Stage consumption.** Predicates reference configured membership; grain reads *"Inherited from included stages"*; nothing re-derives membership. **The frozen chain, working.** This is the strongest constitutional compliance found in any review.
2. **Navigation.** Own routes, deep links that preserve the view, config-driven order and visibility, honest empty resolution. Law 7 and Law 8 hold.
3. **Operator-facing descriptions.** *"Children that want to start but no available space."* The clearest writing in the product.
4. **Honest catch-all grain.** All Leads declining to assert a row type is the model working.
5. **Mixed-grain protection.** *"Mixed row types — resolve before saving"* blocks the incoherent case at author time.
6. **Count/row parity.** Pills match rows across all six views.

### 2. Canonical Product rule — Work View naming relative to Stage naming

> **A Work View may name the operator's job. It may not rename her position.**
>
> A label may differ freely from its stages when it frames *what she is doing* ("Tours", "New Leads"). The surface must still let her answer *where that work sits in the Business Process* — **the journey must be visible beside the lens, not replaced by it.**
>
> **The test:** after working a view, can the operator name the stage her records are in? If not, the label has become an alternate stage vocabulary — forbidden by *"Work Views must not become an alternate Stage system."*

**"Registration" → `Stage equals Enrolling` fails this test today** — not because the names differ, but because **nothing connects them.** The rule does not require matching. It requires **traceability**.

### 3. Canonical Product rule — Work View grain inheritance

> **Stage owns grain. A Work View inherits grain only from the stages it actually scopes to. A Work View that scopes to no stage has no authored grain — and must say so.**
>
> Grain is a **configuration fact** only when a stage predicate exists. Otherwise it is a **runtime fact**, and the honest report is *"determined by the records that match at runtime."*

**All Leads is correct.** **Active Pipeline and Tours are the violation** — they claim inheritance from nothing.

### 4. Are Work Views truly functioning as operator navigation?

**Yes.** This is the clearest **pass** in the compliance review. Each view is a real route; deep links preserve it; order and visibility are configured; returning preserves place. The operator knows where she is and never feels she changed products.

### 5. Can an administrator predict the resulting operator experience?

**No.** She can predict *which records appear* when she scopes to a stage. She cannot predict what a row represents without one, what opens, what Frame results, or whether her description matches her predicate. **Active Pipeline is the standing proof.**

### 6. Do counts, rows, membership, and Focus Panel scope tell one coherent story?

**Three of four. Counts and rows agree — the projection works. Membership and Focus Panel scope do not join the story:**

- **Membership** is computable but never consulted — `resolveFocusPanelScope` has zero callers, so a record outside the active view is shown silently.
- **Focus Panel scope** is case-grain regardless of the view's declared grain, so a **Child**-grain view opens a **family**.
- And **"Overdue work" tells a fourth story entirely** — a different grain, from a different engine, under a borrowed name.

**The projection is not the problem. Everything that agreed to derive from it is coherent. The incoherence is entirely in what refused to.**

### 7. Minimum Product changes for Work View compliance

1. **Stop claiming inheritance that did not occur.** A view scoping to no stage must report grain the way All Leads already does.
2. **Make the journey traceable beside the lens** — the operator must be able to reach the stage her work sits in. Naming freedom stays.
3. **Reconcile a view's description with its predicate** — Active Pipeline's zero must mean *no work*, not *misconfigured*.
4. **Let the Frame be established** (Review 02 · F2) — including the honest neutral Frame for catch-alls.
5. **Express out-of-scope** (Review 02 · F4) — membership is computed; consult it.

Items 4 and 5 are **inherited dependencies**, not Work View defects. **Work Views cannot become compliant while the panel that consumes them is not.**

### 8. Deferred to Review 05 — Configuration and cross-surface coherence

1. **Three vocabularies, one journey**: Work View labels (Registration, Active Pipeline) · lane names (Follow Up, Enrolling, Enrolled) · Configuration Health's list. Which is the operator's, and who owns reconciliation?
2. **"Overdue work" counts tasks; queues count records.** Where must provenance and grain be declared so a KPI cannot borrow a queue's name?
3. **Two Focus Panel surface assignments coexist** — *"Enrollment Focus Panel Summary · V10"* on New Leads, *"Surface default"* on the rest. Does surface assignment per view fragment the one-panel promise?
4. **`primary_total_label: "Work Units"`** on the pipeline definition — a lane total labelled with the container concept's name.
5. **Grain vocabulary vs universality** — `family | child` with three row types "COMING SOON", against Hiring's candidate and Maintenance's asset.
