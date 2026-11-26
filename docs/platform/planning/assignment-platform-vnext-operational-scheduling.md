---
owner: platform
status: proposed
last_reviewed: 2026-07-25
supersedes: []
---

# Assignment Platform VNext — Operational Scheduling Evolution

**Status:** Product realization specification only. **Do not implement from this document until Kelly authorizes a build sprint.**

**Stance:** Design from the operator experience of sophisticated childcare operators. Ground vocabulary in the accepted Assignment Platform foundation (Assignment as the operational atom; Scheduling as recurrence/pattern/lifecycle views; Primary as effective-dated command; Assignment Types as config vocabulary). Do not invent a parallel scheduling engine.

**Out of scope here:** Schema migrations, UI builds, bulk engines, attendance redesign, Billing generation.

---

## 1. North star

Operators should answer, without translating into “schedules”:

1. **What is this child committed to today?**
2. **What will they be committed to next?**
3. **What temporary overlays are in effect?**
4. **What conflicts or aging-up decisions need me?**
5. **What happened before?**

A child (later staff) may hold **many concurrent operational commitments**. Recurrence, room, season, and billing participation are properties of those commitments — not separate products.

---

## 2. Capability inventory

Each capability is classified:

| Class | Meaning |
|-------|---------|
| **In Assignment Platform** | Assignment ledger, types, commands, projections, or assignment-owned config |
| **Adjacent (consume)** | Owned elsewhere; Assignments emit/consume signals |
| **Config / templates** | Tenant configuration that shapes Assignments |
| **Defer** | Valuable later; not required to complete VNext product shape |

### 2.1 Inventory

| Operator need | Product concept | Class | Notes |
|---------------|-----------------|-------|-------|
| Multiple concurrent assignments | Concurrent typed Assignments on one subject | **In** | Foundation already targets this |
| Before / After care | Assignment Types + concurrent rows | **In** | Type vocabulary, not special-case engines |
| Enrichment / therapy / transport | Assignment Types + optional billing participation | **In** | Display relationships; Billing owns charges |
| Universal Pre-K / Mother’s Day Out | Program + Assignment Type + site pattern presets | **Config** | Vertical labels in tenant config/presets — not platform identity |
| Split attendance | Attendance facts keyed by Assignment / day portion | **Adjacent** | Assignment declares participation; Attendance owns presence |
| Temporary assignments | `kind=temporary` bounded Assignments | **In** | Overlay semantics; do not replace Primary silently |
| Summer / school-year assignments | Seasonal windows (dated Assignment sets) | **In** + **Config** | Season packs / templates; effective dating owns truth |
| Future effective-dated assignments | Upcoming Assignments | **In** | Already a lifecycle bucket; deepen authoring UX |
| Assignment history | Supersede/end chain + History projection | **In** | Never overwrite |
| Assignment forecasting | Horizon projection over Upcoming + plans | **In** (read) | Derived; not a second ledger |
| Assignment conflicts | Conflict projection over Assignments + calcs | **In** (detect) + **Adjacent** (capacity/ratio) | Hard vs soft (see §7) |
| Future scheduling | Horizon Timeline + Upcoming authoring | **In** | Planning surface over the same atoms |
| Standard transition plans | Org/site Transition Plans | **Config** owned by Assignment Platform product | Applies via commands |
| Aging-up reminders | Attention items from plan rules + age | **Adjacent** (Work/Attention) | Plan rules live with Transition Plans |
| Automatic room transitions | Effective-dated Primary / room change commands | **In** (command) | Never silent; BOS may recommend |
| Assignment Templates | Reusable Assignment blueprints | **Config** | See §4 |
| Recurring vs one-shot services | Type + pattern + open/bounded window | **In** | Same ledger; different shape |

---

## 3. Canonical ownership

| Concern | Owner | Must not |
|---------|-------|----------|
| Operational commitment (who/what/when/where/pattern) | **Assignment Platform** | Invent CRM or enrollment substitutes |
| Primary operational home | **Assignment Platform** via `assignment.set_primary` | Browser toggle / silent flip |
| Assignment Type vocabulary | **Configuration** (`operational_assignment_types`) | Hardcoded industry branches in shared modules |
| Recurrence patterns | **Scheduling patterns** (existing) | Duplicate pattern stores per type |
| Room capacity / ratios | **Operational Calculations** | Assignments computing staffing truth |
| Billing amounts / charges | **Billing** | Assignments generating ledger rows |
| Attendance presence | **Attendance** | Assignments storing check-in facts |
| Enrollment materialization | **Enrollment / agreements** | Pre-enrollment metadata becoming operational ledger |
| Attention / aging-up work | **Work Items / Attention** | Embedding a second reminder product in Assignment rows |
| Proactive recommendations | **BOS** through Action Runtime | Auto-mutating without preview/confirm |
| Queues / Workspace shells | **Existing Workspace** | Redesigning Workspace for Assignments |

**Invariant:** One ledger of Assignments. Every surface is an index (by subject, room×day, horizon, household). No parallel “future schedule store.”

---

## 4. Configuration hierarchy

```text
Organization
  └─ Assignment Types          (vocabulary: Primary Classroom, Before Care, …)
  └─ Transition Plans          (ordered stage recipes + aging rules)
  └─ Assignment Templates      (reusable commitment blueprints)
  └─ Season Packs (optional)   (Summer / School Year date conventions)
       └─ Site
            └─ Operating days, patterns, rooms, programs
            └─ Site overrides of plan/template eligibility
                 └─ Subject (child | staff)
                      └─ Assignment rows (operational truth)
```

### 4.1 Should Assignment Templates exist?

**Yes.** Templates are **blueprints**, not truth.

A Template typically packages:

- Assignment Type
- default pattern / hours intent
- billing participation hint (eligible / none) — not a rate
- attendance / staffing participation hints
- optional program/room resolution policy (“same as Primary,” “resolve by age band,” “operator picks”)
- default open-ended vs bounded window style

**Operators use Templates to create Assignments quickly.** Instantiating a Template always creates Assignment row(s) via registered commands with preview. Templates never substitute for the ledger.

### 4.2 Should organizations define Standard Transition Plans?

**Yes.** A Transition Plan is an ordered, criteria-driven recipe for **future Primary (and optional companion) Assignments**.

Example (labels are tenant config, not platform nouns):

```text
Infant → Toddler → Preschool → Pre-K
```

Each stage declares:

- entry criteria (age band, program category, date rule)
- target Assignment Type(s) (usually Primary + optional companions)
- room/program resolution policy
- lead-time for aging-up attention (e.g. 60 days before birthday/criteria)
- whether Before/After companions carry forward

**Plans do not move children by themselves.** They produce **proposed Upcoming Assignments** (or BOS recommendations) that operators confirm.

### 4.3 Auto-offer on new enrollment?

**Yes — offer, never silent apply.**

At enrollment materialization (or first Primary create):

1. If a site/org Transition Plan is eligible, show **Apply transition plan** with a preview of Upcoming stages.
2. Operator confirms → commands create Upcoming Assignments (and/or plan instance).
3. Decline → continue with single Primary only.

Pre-enrollment participation remains planning-only until materialization.

---

## 5. Future assignment model

### 5.1 Shape

Future work is still **Assignments** with `start_date` in the future (lifecycle **Upcoming**). Optional linkage:

- `transition_plan_id` / `transition_stage_key` (provenance)
- `template_id` (provenance)
- `season_key` (config label only)

No separate “future schedule” entity.

### 5.2 How operators visualize future assignments

Three complementary views (one model):

| View | Question answered |
|------|-------------------|
| **Assignment Summary** | What commitments exist (current + chips for upcoming count)? |
| **Horizon Timeline** | Across weeks/months, when does Primary and companions change? |
| **Day Timeline** | On a chosen day, what concurrent blocks run? |

**Upcoming** remains the operator word for not-yet-effective commitments (prefer over “Future” as a status).

### 5.3 How operators edit a future transition

1. Open the Upcoming Assignment (or Horizon node) → Assignment Detail.
2. Edit pattern/room/dates via existing effective-dated edit/create/supersede paths.
3. Changing Primary still uses `assignment.set_primary` with an effective date (may be future).
4. Canceling a planned transition **ends/supersedes** the Upcoming row — does not delete history if already partially applied.

Editing a stage in a Transition Plan definition updates **future applications**, not already-committed Assignments, unless the operator explicitly re-applies.

---

## 6. Timeline evolution

### 6.1 Should Assignment Timeline become the canonical planning surface?

**Split the Timeline family — do not overload Day Timeline.**

| Mode | Canonical for | Grain |
|------|---------------|-------|
| **Day Timeline** (V1 foundation) | Understanding concurrent commitments / overlaps on one weekday | Minutes within a day |
| **Horizon Timeline** (VNext) | Planning transitions, seasons, upcoming Primaries | Days → months |
| **History strip** | What changed | Effective-dated chain |

**Recommendation:**

- Keep Day Timeline as the signature comprehension tool inside Assignment Detail (and later Household / Workspace / Staff).
- Add Horizon Timeline as the **canonical planning surface** for transitions and seasonal packs.
- Do **not** invent synthetic “return to Primary” segments without data; transitions are explicit Upcoming rows or overlap annotations.

Reusable pure builders remain mandatory (one implementation per mode).

---

## 7. Conflicts

### 7.1 Conflict classes

| Class | Examples | Operator treatment |
|-------|----------|-------------------|
| **Hard** | Overlapping Primary windows; two Primaries; room over capacity if policy says block | Block commit / show blocker |
| **Soft** | Intentional enrichment overlap during Primary hours; before-care abutting Primary | Warn + explain; allow |
| **Policy** | Temporary move against anti-shuffle policy | Warn / require reason |

### 7.2 How conflicts appear

- **Assignment Summary:** compact conflict chip on affected rows
- **Assignment Detail / Day Timeline:** overlap note (V1 already) + severity
- **Horizon Timeline:** conflict markers on transition dates
- **Scheduling Workspace attention:** countable “Assignment conflicts” launch (consume Conflict projection)
- **Command preview:** blockers/warnings before execute

Conflicts are a **read projection** over Assignments + Operational Calculations — not a separate writable conflict table as source of truth (optional cache later).

---

## 8. Transition planning concepts

### 8.1 Objects

```text
TransitionPlan (config)
  └─ stages[] (ordered)
        criteria, target types, room policy, lead_time

TransitionPlanInstance (optional operational binder on a subject)
  └─ links to Upcoming Assignments created from stages

AgingRule → Attention item (Work)
```

### 8.2 Aging-up reminders

- Generated when a subject approaches a stage’s criteria within `lead_time`.
- Appear as **Attention / Work Items**, with deep link to Horizon Timeline + proposed Upcoming Assignment preview.
- Clearing a reminder requires an operator decision: apply stage, snooze, or dismiss with reason (policy).

### 8.3 “Automatic” room transitions

**Product meaning:** system **prepares** the next Primary Assignment (room/program resolved by policy) and prompts at the right time.

**Platform meaning:** registered command execution after preview/confirm. No silent overnight room swap.

---

## 9. Temporary vs recurring vs seasonal

| Shape | Definition | Operator language |
|-------|------------|-------------------|
| **Recurring** | Pattern-bearing Assignment, usually open-ended or long window | “Ongoing assignment” |
| **Temporary** | Bounded Assignment that **overlays** the arrangement for a window without rewriting the whole history as a new Primary (unless Primary change is intended) | “Temporary assignment” / temporary move |
| **Seasonal** | A dated pack of Assignments (often Primary + companions) for Summer or School Year | “Summer arrangement” / “School-year arrangement” |

Seasonal is **not** a third ledger kind by default — it is a **dated set** (often from a Season Pack / Templates) that becomes Upcoming then Current through effective dating.

Temporary differs from seasonal by **intent and duration policy**: temporary is an overlay/exception; seasonal is the planned arrangement for a term.

---

## 10. BOS opportunities

BOS may **propose**, never silently commit:

| Opportunity | Trigger | Action path |
|-------------|---------|-------------|
| Upcoming transition due | Aging rule / plan stage | Preview Apply stage → `assignment.create` / `set_primary` |
| Missing companion | Primary without Before/After when site policy expects | Offer Template instantiate |
| Soft overlap unexplained | Enrichment overlapping Primary with no note | Ask operator to confirm intentional |
| Seasonal rollover | Approaching Season Pack boundary | Offer apply Summer/School-year pack |
| Conflict hard | Capacity/Primary overlap on proposed change | Block with explanation |

All mutations go through **Action Runtime** (eligibility, preview, confirm, audit, refresh).

---

## 11. Operator workflow recommendations

### 11.1 Daily (current truth)

1. Open subject → Assignment Summary (calm for one Primary; list for many).
2. Use Day Timeline when overlaps/companions matter.
3. Drill Assignment Detail for identity, effects, billing relationship display.

### 11.2 Planning (next term / aging-up)

1. Open Horizon Timeline for the child (or classroom cohort later).
2. Review Upcoming Primaries and seasonal packs.
3. Confirm or edit transitions; resolve Attention items.

### 11.3 Exceptions

1. Create Temporary Assignment from Template or Duplicate.
2. Conflict projection explains overlay vs Primary.
3. End temporary → return to prior arrangement without rewriting history.

### 11.4 Enrollment

1. Materialize agreement + Primary.
2. **Offer** Transition Plan application (preview).
3. Optionally attach companion Templates (Before/After).

### 11.5 Staff readiness (later UI)

Same Summary / Detail / Day / Horizon model with `subjectType=staff`. No separate staff scheduling product.

---

## 12. Answers to the mission questions (compact)

| Question | Answer |
|----------|--------|
| Should Assignment Templates exist? | **Yes** — blueprints that create Assignments via commands. |
| Standard Transition Plans? | **Yes** — org/site ordered stage recipes. |
| Auto-apply on enrollment? | **Offer with preview** — never silent. |
| Visualize future? | **Upcoming + Horizon Timeline**; Day Timeline for concurrent days. |
| Edit future transition? | Edit/supersede Upcoming Assignment; plan definition ≠ committed rows. |
| Timeline as canonical planning surface? | **Horizon Timeline** for planning; **Day Timeline** for day comprehension. |
| Conflicts? | Hard/soft/policy projection on Summary, Detail, Horizon, Workspace attention. |
| Aging-up reminders? | Attention/Work from plan rules; deep link to Horizon. |
| BOS recommend transitions? | **Yes, proactive propose** through Action Runtime. |
| Temporary vs recurring? | Bounded overlay vs ongoing pattern commitment — same ledger. |
| Seasonal? | Dated Assignment packs (Templates/Season Packs), effective-dated into Current. |

---

## 13. Suggested phasing (design only — not a build order commitment)

| Phase | Product outcome |
|-------|-----------------|
| **2A** (in progress / accepted direction) | Concurrent Assignments legible; Day Timeline V1; types; primary command |
| **2B** | Type picker; secondary edit; Horizon Timeline V1; conflict projection V1 |
| **2C** | Templates + Transition Plans + enrollment offer + aging Attention |
| **2D** | Season Packs; BOS transition proposals; cohort/classroom horizon |
| **Later** | Staff Horizon; forecasting polish; bulk apply plans (Command Runtime) |

---

## 14. Non-goals (reaffirmed)

- No parallel scheduling engine
- No Workspace / Focus Panel shell redesign as a prerequisite
- No Billing charge generation from Assignment Types alone
- No Attendance redesign
- No silent automatic room moves
- No childcare-hardcoded platform identity (UPK/MDO as config presets)

---

## 15. Document map

- Foundation inventory: `docs/audits/active/assignment-platform-foundation-inventory-2026-07.md`
- Foundation certification: `docs/audits/active/assignment-platform-foundation-certification-2026-07.md`
- Projection contract: `docs/platform/planning/scheduling-projection-contract.md`
- Temporary move policy: `docs/platform/planning/temporary-move-policy-model.md`
- Scheduling ↔ Billing boundary: `docs/platform/planning/scheduling-billing-boundary.md`
