---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# Constitutional Compliance Review · 05 — Configuration and Cross-Surface Coherence

**Status:** Draft — Product Office certification artifact. Not doctrine until ratified.

**Question answered:** can an administrator configure Alloy once and trust every operator-facing surface to express the same meaning?

## Evidence discipline

**Observation window: 2026-07-16T22:09Z – 22:13Z**, authenticated, Firefly tenant, `localhost:3011`, branch @ `3cd8f8000`.

| Class | Treatment |
|---|---|
| **Stable configuration evidence** | Builder/Surfaces/Work View config, shipped copy, route behavior. Reproducible; safe to compare across this review. |
| **Mutable tenant data** | Record counts, KPI values, queue rosters. **Timestamped at capture. Never compared across timestamps.** |

**Recorded fact:** the tenant's data changed between Review 01 (leads 4, children 7) and Review 04 (leads 3, children 6). **I did not verify the cause and do not assert one.** Deliverable 04 noted the change pattern matched the duplicates reported in 01; that remains a `HYPOTHESIS`. No count in this review is compared against a pre-22:09Z capture.

---

## Verdict

**Alloy has one configured operational model. It does not yet have one configuration product.**

The model is coherent and the information architecture is genuinely good. But **four concerns are authored in two places each**, and — the root violation — **the administrator cannot tell which of her decisions actually steer the running product.**

---

## Root violations

### R1 — Configuration is not authoritative, and nothing says which parts are · **Product** / **Runtime Expression**

**Constitutional principle:** *Configuration steers behavior. Runtime owns execution. Code owns invariants.*

**Surfaces affected:** Process Actions · Current Work · Configuration Health · Focus Panel.

**One violation, three manifestations** (`VERIFIED`, stable config evidence):

1. `Send Form` = **`OFF · Disabled · All stages`** in Process Actions.
2. Current Work offers the operator **"Send form"** under MORE ACTIONS.
3. Configuration Health reports **"Actions configured — Ready."**

These are not three findings. **They are one: configuration is advisory where it claims to be authoritative, and the product never discloses the difference.**

**Steering audit** — what each configured decision actually does:

| Configured decision | Kind | Evidence |
|---|---|---|
| Work View predicates | **Authoritative** | Counts and rows both derive from them (`VERIFIED`) |
| Work View visibility / order | **Authoritative** | Nav order 1–5 from config (`VERIFIED`) |
| Work View labels & descriptions | **Authoritative** | Rendered verbatim (`VERIFIED`) |
| Inherited grain | **Authoritative** where a stage is scoped; **fabricated** where none is (Review 04) | `VERIFIED` |
| Outcome availability | **Authoritative** | The picker renders configured outcomes (`VERIFIED`) |
| Stage movement | **Authoritative — but from two authors** (see R2) | `VERIFIED` |
| Requirements & enforcement | **Partially consumed** — type-scope authoritative; instance resolution absent (Review 03) | `VERIFIED` |
| Surface assignments | **Authoritative** | New Leads → *"Enrollment Focus Panel Summary · V10"* (`VERIFIED`) |
| **Action enabled / disabled** | **IGNORED** | `Send Form` OFF → still offered (`VERIFIED`) |
| Action placement | **Partially consumed** (`HIGH CONFIDENCE`) | Health reports a placement matrix; Current Work sources actions separately |
| Default subject / entry | **Not implemented** — doctrine describes it; the strategy slot is `NOT YET IMPLEMENTED` | `HIGH CONFIDENCE` |

**Product consequence — the most serious in the review.** Eleven decisions, five kinds, **and the administrator has no way to tell them apart.** She cannot know that her Work View predicate is law while her action switch is a suggestion. **An advisory control that looks authoritative is worse than a missing one:** it produces confident, wrong configuration, which is exactly what the live tenant contains.

### R2 — Four concerns are authored in two places · **Product**

**Constitutional principle:** the frozen ownership chain — *"If a design decision violates this chain, stop and redesign it."*

| Concern | Constitutional owner | Second author | Evidence |
|---|---|---|---|
| **Stage grain** | Stage — *"Stage owns operational work (grain…)"* | **`Journey`** (Operational Experience) duplicates `ROW TYPE (GRAIN)` (Stage Context) | `VERIFIED` |
| **Stage movement** | Outcome — *"movement is earned through outcomes"* | **`Outgoing Transitions`** — which renders *empty* while outcomes move records | `VERIFIED` |
| **Operational counts** | Operational Projection | **Operational Calculations** (Data Model → metrics) — and the tiles sit on the operator's queue surface | `VERIFIED` |
| **Automation** | one owner | **`/settings/automation`** (top-level) **and** Processes → Automation (*"coming next"*) | `VERIFIED` — two homes |

**Product consequence:** every duplicate is a permission to contradict. `Journey` vs `ROW TYPE` is the origin of the child-track failure; outcome-vs-transition is why the Builder shows an empty section while records move. **The administrator can produce a self-contradicting process and the product will accept it.**

### R3 — Health certifies wiring, not intent · **Product**

**What "HEALTHY" currently means, precisely** (`VERIFIED`, stable):

> *"Workspace tile visible" · "Queue views published" · "Queue views match statuses" · "Records query ready" · "Actions configured"*

**All five ask *"is it connected?"* None asks *"will this do what she intended?"***

Measured against the brief's checklist, Health verifies **existence** and **structural validity**. It does **not** verify: semantic validity · valid Stage targets · valid Outcome references · action/config runtime parity · coherent grain · Work View predicate validity · missing forward paths · dead routes · disabled capabilities still exposed · conflicting ownership.

**Its own evidence is stale** (`VERIFIED`): it cites **`/dept`**, which returns **404** and renders the **public marketing site with a "Sign In" link**; it names **7 work units** that do not match the operator's **6**; it says *"**Lifecycle** appears on the workspace"* using a retired name; it prints *"Actions matrix: 2 work-unit rail; 1 queue row; 6 drawer; 1 other"* — a debug string.

**Product consequence:** HEALTHY is **not a statement that the product will behave as intended.** It is a statement that the plumbing resolves. **Misleading reassurance is the most damaging possible failure of a trust layer** — it converts healthy uncertainty into confident error, on the one screen whose entire job is to prevent that.

### R4 — Numbers borrow names without sharing cohort or grain · **Product**

**Constitutional principle:** *"Analytics metrics… must not masquerade as operational queue truth"* · *"Analytics is not operational truth… they may differ in scope and **must be labeled as such**."*

**`VERIFIED` at 22:09Z** — on one screen, adjacent:

| Where | Word | Counts | Grain | Source |
|---|---|---|---|---|
| KPI tile | **"Overdue work"** | `operational_tasks` past due | task | Operational Calculations |
| Queue row badge | **"Overdue"** | the record's attention state | record | Operational Projection |
| KPI tile | **"Needs attention"** | bounded snapshot, **cap 2000**, *"NOT exhaustive org total"* | org | Operational Calculations |
| Work View signal | **"Needs attention"** | per-view attention rows — *"NOT the count"* | view | Operational Projection |

**The same word means different things within inches of itself, and nothing declares the difference.** The render VM carries `label`, `formattedValue`, `status`, `drillHref` — **no cohort, no grain, no provenance** (`HIGH CONFIDENCE`).

**The configuration layer causes this**: numbers have **two configuration homes** — Data Model → *Operational Calculations* and Operations → *Processes/Work Views* — and only the latter is bound to the queue the operator is reading.

**A number is not required to use the Operational Projection.** *"Overdue work"* may legitimately count tasks. **It may not do so while wearing a queue's word on the queue's own surface.**

### R5 — Nothing shows the operator experience before publishing · **Product**

`VERIFIED`: *"Preview runtime… filters and assigned layouts apply **when saved**"* — post-save only. *"Preview work unit"* exists only in dead code.

**Product consequence:** the administrator discovers her configuration by becoming her own operator. **Every defect in Reviews 01–04 was reachable only that way** — including Active Pipeline, whose description and count disagree, which shipped because nothing at author time could compare them.

### R6 — Universality is blocked by four different things, and only one is the model · **Product**

The brief asks for this distinction explicitly:

| Blocker | Kind | Evidence |
|---|---|---|
| **The Product model** | **No limitation found.** Predicates, sort, grouping, surface refs, outcomes, requirements-timing are all domain-neutral | `VERIFIED` |
| Grain vocabulary `family \| child`; 3 of 5 row types **"COMING SOON"** | **Configuration UX limitation** | `VERIFIED` |
| `StageEditorV2` imports **`enrollmentStageMembership`**; Stage Membership **silently disappears** when it doesn't match | **Implementation hardcode** (violates frozen **P15**) | `HIGH CONFIDENCE` |
| The single Focus Panel surface is named **"Enrollment Focus Panel"** | **Configuration UX limitation** — `HYPOTHESIS` that a second domain forces a second panel surface | `VERIFIED` (the name) |
| Action authoring · Automation · 3 row types | **Capability not yet built** | `VERIFIED` |

**The model is universal. Its vocabulary and one hardcode are not.**

---

## Vocabulary and traceability

**Which vocabulary is authoritative for what** (`VERIFIED`, from doctrine + running product):

| Question | Authoritative vocabulary |
|---|---|
| **Where is this record in the process?** | **Stage labels** (Processes → Stages) |
| **What am I navigating?** | **Work View labels** — *"Operator navigation is the Work View, not the stage or the lane"* |
| **What may use customer-friendly language?** | Work View labels · queue row copy · Current Work copy · outcome labels |
| **What is implementation-only?** | lane names · queue keys · slugs · grain |

**Where labels currently imply two concepts are one** (`VERIFIED`):

- **"Needs attention"** — a KPI tile *and* a Work View signal. **Same name, two numbers, two engines.** The clearest violation in the product.
- **"Overdue"** — a row badge (records) beside **"Overdue work"** (tasks).
- **"Registration"** (Work View) vs **"Enrolling"** (Stage) — different names, **no link**.
- **`primary_total_label: "Work Units"`** on a lane — a lane total wearing the container concept's name.
- **"Lifecycle"** (Health) vs **"Processes"** (nav) — a retired name in a success message.

---

## Defaults and fallbacks — what is honestly explained: **nothing**

| Behavior | Kind | Explained to anyone? |
|---|---|---|
| Default Work View | **Configured** (order 1) | Implicitly, via order |
| Retained subject | **Platform-owned**, working | No |
| Empty-view behavior | **Platform-owned**, honest (*"null only after an authoritative empty result"*) | No |
| **Default operational subject strategy** | **Described in doctrine, absent from the product** — slot is `NOT YET IMPLEMENTED` | **No** |
| **First-row fallback** | **Silently defaulted** — doctrine says *"the runtime no longer opens the 'first row'"*; first row is the effective default | **No** |
| **Out-of-scope subject** | **Designed, zero callers — absent** | **No** |

**`VERIFIED`: there is no configuration surface for default subject strategy at all.** **Product consequence:** two of six behaviors are described in doctrine and absent from the product, and **neither the administrator nor the operator is told.** The doctrine's own rule — *"do not fall back silently to 'first row' without documenting the fallback as explicit platform behavior"* — is met in code comments and **not in the product**.

---

## Closing answers

### 1. What must be protected

1. **The configuration information architecture.** *"Configure Alloy across your organization, data model, operational workflows, and business modules"* → **Organization · Data Model · Operations · Business**. Plain language, correct grouping, no runtime terms. `VERIFIED`
2. **One Focus Panel surface exists.** Surfaces → Focus Panels contains a single *"Enrollment Focus Panel"*. **The one-panel promise is intact at the configuration layer** — no per-domain panel products.
3. **Work View stage consumption** (Review 04) — the frozen chain, working.
4. **"Required when"** (Review 03) — the best control in the product.
5. **Authoring restraint** — auto-generated keys, no JSON textareas, humanized operators.
6. **Count/row parity** — where surfaces agreed to derive from the projection, they are coherent.

### 2. Canonical ownership map

| Concern | Constitutional owner | Respected? |
|---|---|---|
| Stage Membership | Stage | ✅ single |
| **Stage grain** | Stage | ❌ **`ROW TYPE (GRAIN)` + `Journey`** |
| Work View membership | Work View predicates | ✅ |
| Work View name/description | Work View | ✅ |
| Queue row presentation | Surface | ✅ |
| Focus Panel composition | Surface | ⚠️ one surface, but assignable per Work View |
| Record of Attention | Runtime — not authored | ✅ correctly unowned by config |
| **Context Frame** | Entry intent | ⚠️ **unowned and unexpressed** |
| Current Work | Work template | ✅ |
| Requirements | Stage | ✅ |
| Outcomes | Stage | ✅ |
| **Action availability** | Process Actions | ❌ **authored, not honored** |
| Action placement | Process Actions | ⚠️ partially consumed |
| **Stage movement** | Outcome | ❌ **outcome targets + Outgoing Transitions** |
| **Operational counts** | Operational Projection | ❌ **projection + Operational Calculations** |
| Health verdicts | Configuration Health | ⚠️ single owner, wrong criteria |
| Surface composition | Surface Builder | ✅ |
| **Automation** | one owner | ❌ **two homes** |

**Twelve respected · six violated or degraded.**

### 3. The Product rule for vocabulary flexibility and traceability

> **Stage labels are authoritative for position. Work View labels are authoritative for navigation. Any surface may use customer-friendly language for the *job*. No surface may use another concept's *name* for a different cohort or grain.**
>
> **Labels may differ. Concepts may not merge.**
>
> **Two tests:**
> 1. **Traceability** — after working a view, can the operator name the stage her records are in? If not, the label has replaced the journey.
> 2. **Non-collision** — does this word already name a different cohort or grain on a surface the operator can see at the same time? If yes, the label is lying by proximity.
>
> *"Registration" fails test 1. "Needs attention" and "Overdue" fail test 2.*

### 4. Does configuration steer the running product?

**Partially — and that is the problem.** Predicates, labels, visibility, order, outcomes and surface assignments steer. **Action enable/disable does not.** Requirements steer at type-scope only. Default subject is not implemented. **Five different kinds of authority, presented identically.** Until an administrator can tell which is which, **no configuration on any of these screens can be trusted — including the ones that work.**

### 5. Does Surface configuration preserve one universal Focus Panel?

**Yes today — by scarcity, not by rule.** One Focus Panel surface exists, so nothing is fragmented. But surface assignment is **per Work View** (New Leads → *"Enrollment Focus Panel Summary · V10"*; others → *"Surface default"*), and the one panel is named for a domain.

**Constitutionally this is legitimate**: the Constitution permits a Frame to *"change what leads — which mode opens first and which cards surface."* **Per-view assignment that re-orders and emphasizes cards is the Frame mechanism doing its job.** It becomes fragmentation only if a second surface composes a *different panel product* rather than the same panel led differently. **`HYPOTHESIS`** — untestable with one panel configured. **Flagged, not adjudicated.**

### 6. Do counts and metrics communicate honest provenance?

**No.** Not one displayed number declares what it counts, at what grain, over what cohort, or from which source. Two words — **"Needs attention"** and **"Overdue"** — each name two different cohorts on the same screen. The one number that has never reconciled with anything the operator can see (*"Overdue work"*) is the one wearing a queue's word.

### 7. Can Configuration Health be trusted, and what does HEALTHY certify?

**No.** **HEALTHY currently certifies that the plumbing resolves** — a tile renders, queues exist, filters parse, a records query returns, an actions matrix is populated.

**It does not certify that the configured product will behave as intended**, and it does not say so. It reported HEALTHY over a process with a dangling stage target, no forward path from Lead to Tour, and four journey-critical actions disabled — while citing a route that 404s to the marketing site.

**That gap between what it checks and what its word means is the violation.** The word "Healthy" promises intent; the check delivers wiring.

### 8. Could another domain be configured without Engineering or hidden enrollment knowledge?

**No — but the model is not why.** Nothing in the *Product model* is enrollment-shaped. Blocked by, in order of severity: an **implementation hardcode** (Stage Membership silently vanishes for non-enrollment), a **configuration UX limitation** (grain is `family | child`; three row types "COMING SOON"), and **capabilities not yet built** (action authoring, automation).

**Per the brief's instruction, an unbuilt domain is not evidence against the model — and I found no evidence against the model.**

### 9. Minimum Product changes before Configuration can be trusted

1. **Make configuration authoritative — or declare where it isn't.** An action switched OFF must not reach the operator. **This is the single highest-value change across all five reviews.**
2. **One concern, one author.** Resolve `Journey`, movement, counts, automation.
3. **Make HEALTHY mean intent** — or rename what it certifies. Its current word overpromises its current check.
4. **Give every displayed number a declared cohort, grain, and source** — and stop letting analytics borrow queue words on queue surfaces.
5. **Show the operator experience before publishing.**
6. **Explain defaults and fallbacks in the product**, not only in code comments.
7. **Remove the domain hardcode** (P15).

Items 1–3 are prerequisites for trusting anything else.

### 10. Deferred to Review 06 — End-to-End Operator Experience

1. Can a director complete **Lead → Tour → Decision → Waitlist → Enrolling → Enrolled** in the running product — and where does she stop first?
2. Does the **journey** she experiences match the journey the Builder describes?
3. When configuration is advisory (R1) and Health is green (R3), **what does she believe about her own system, and when does she find out?**
4. **Does she ever need to leave Current Work** — and is each departure a product gap or a legitimate cross-process hop through Work Items?
5. The **"Overdue work" tile** has now failed to reconcile across two datasets. Does she notice, and what does she conclude?
6. Does the **out-of-scope absence** produce a visible wrong answer end-to-end, or only a missing explanation?
